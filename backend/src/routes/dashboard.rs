use axum::{
    extract::{Path, State},
    http::HeaderMap,
    response::IntoResponse,
    Json,
};
use chrono::Datelike;
use tracing::{debug, error, info};

use crate::models::{
    DashboardResponse, FamilyData, FamilyMember, MemberContribution, PersonalData,
};
use crate::state::AppState;
use crate::teable;
use crate::utils::{
    calculate_total_hours, convert_work_hours_to_entries, extract_user_id_from_headers,
    get_member_work_hours_info, log_work_entries,
};

pub async fn dashboard(
    State(state): State<AppState>,
    Path(year): Path<String>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, axum::http::StatusCode> {
    debug!("Dashboard: Starting dashboard request for year: {}", year);

    let user_id = extract_user_id_from_headers(&headers)?;

    debug!("Dashboard: User ID from token: {}", user_id);

    // Get current user by ID
    let current_user = teable::get_member_by_id_with_projection(
        &state.http_client,
        &user_id,
        Some(
            &[
                "Vorname",
                "Nachname",
                "Email",
                "Familie",
                "Geburtsdatum",
                "Eintrittsdatum",
            ][..],
        ), // Only fields needed for dashboard
    )
    .await
    .map_err(|e| {
        error!("Dashboard: Failed to get member by id: {}", e);
        axum::http::StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or_else(|| {
        error!("Dashboard: User not found with ID: {}", user_id);
        axum::http::StatusCode::NOT_FOUND
    })?;

    let year_int: i32 = year.parse().unwrap_or_else(|_| chrono::Utc::now().year());

    // Fetch user's work hours for the given year directly from Teable (API-level filtering)
    let work_hours =
        teable::get_work_hours_for_member_by_year(&state.http_client, &current_user.id, year_int)
            .await
            .map_err(|e| {
                error!(
                    "Dashboard: Failed to get work hours for user {} and year {}: {}",
                    current_user.id, year_int, e
                );
                axum::http::StatusCode::INTERNAL_SERVER_ERROR
            })?;

    let user_work_hours_raw = work_hours.results;
    let user_work_hours = convert_work_hours_to_entries(&user_work_hours_raw, "Personal");

    debug!(
        "Dashboard: Found {} work hours for user",
        user_work_hours.len()
    );

    let total_hours = calculate_total_hours(&user_work_hours);
    debug!("Dashboard: Total hours: {}", total_hours);

    // Log the personal work hours entries for debugging
    log_work_entries(&user_work_hours, "Personal");

    // Create personal data with age-based required hours
    let (personal_required_hours, exemption_reason) =
        get_member_work_hours_info(&current_user, year_int);
    let personal_data = PersonalData {
        name: current_user.name(),
        hours: total_hours,
        required: personal_required_hours,
        entries: user_work_hours,
        exemption_reason,
    };

    // Check if user has a family and create family data
    let family_data = if let Some(family_name) = &current_user.family_id {
        if !family_name.is_empty() {
            debug!(
                "Dashboard: Processing family data for family: {}",
                family_name
            );

            // Get family members using optimized query
            let family_members_response =
                teable::get_family_members(&state.http_client, family_name)
                    .await
                    .map_err(|e| {
                        error!("Dashboard: Failed to get family members: {}", e);
                        axum::http::StatusCode::INTERNAL_SERVER_ERROR
                    })?;

            let family_members: Vec<&crate::models::Member> =
                family_members_response.results.iter().collect();
            debug!("Dashboard: Found {} family members", family_members.len());

            // Calculate work hours for all family members
            let mut member_contributions = Vec::new();
            let mut family_total_hours = 0.0;
            let mut family_required_total = 0.0;

            for member in &family_members {
                debug!(
                    "[FAMILY DEBUG] Member: {} | id: {} | family_id: {:?}",
                    member.name(),
                    member.id,
                    member.family_id
                );
                // Fetch work hours for this member and year
                let member_work_hours_raw = match teable::get_work_hours_for_member_by_year(
                    &state.http_client,
                    &member.id,
                    year_int,
                )
                .await
                {
                    Ok(resp) => resp.results,
                    Err(e) => {
                        error!(
                            "Dashboard: Failed to get work hours for family member {}: {}",
                            member.id, e
                        );
                        Vec::new()
                    }
                };
                let member_work_hours = convert_work_hours_to_entries(
                    &member_work_hours_raw,
                    &format!("Family member {}", member.name()),
                );

                let member_hours = calculate_total_hours(&member_work_hours);
                let (member_required, exemption_reason) =
                    get_member_work_hours_info(member, year_int);

                family_total_hours += member_hours;
                family_required_total += member_required;

                // entries_normalized is just member_work_hours now
                let entries_normalized = member_work_hours;

                member_contributions.push(MemberContribution {
                    id: member.id.clone(),
                    name: member.name(),
                    hours: member_hours,
                    required: member_required,
                    entries: entries_normalized,
                    exemption_reason,
                });
            }

            let family_total_rounded = family_total_hours;
            let family_remaining = (family_required_total - family_total_rounded).max(0.0);
            let family_percentage = if family_required_total > 0.0 {
                (family_total_rounded / family_required_total) * 100.0
            } else {
                100.0 // If no hours required, consider it 100% complete
            };

            debug!("Dashboard: Family stats - Required: {}, Completed: {}, Remaining: {}, Percentage: {}%", 
                family_required_total, family_total_rounded, family_remaining, family_percentage);

            Some(FamilyData {
                name: family_name.clone(),
                members: family_members
                    .iter()
                    .map(|m| FamilyMember {
                        id: m.id.clone(),
                        name: m.name(),
                        email: m.email.clone(),
                    })
                    .collect(),
                required: family_required_total,
                completed: family_total_rounded,
                remaining: family_remaining,
                percentage: family_percentage,
                member_contributions,
            })
        } else {
            None
        }
    } else {
        None
    };

    let response = DashboardResponse {
        success: true,
        family: family_data,
        personal: Some(personal_data),
        year: year_int,
    };

    info!(
        "Dashboard: Sending response with {} personal hours and family data: {}",
        total_hours,
        if response.family.is_some() {
            "included"
        } else {
            "none"
        }
    );

    Ok(Json(response))
}
