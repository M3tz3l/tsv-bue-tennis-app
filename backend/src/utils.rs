use crate::auth;
use crate::models::{Member, WorkHour, WorkHourEntry};
use axum::http::{HeaderMap, StatusCode};
use chrono::Datelike;
use tracing::{debug, info, warn};

/// Converts a list of WorkHour to WorkHourEntry (no filtering)
pub fn convert_work_hours_to_entries(
    work_hours: &[WorkHour],
    debug_prefix: &str,
) -> Vec<WorkHourEntry> {
    work_hours
        .iter()
        .filter_map(|wh| {
            match (&wh.date, &wh.description, wh.duration_hours) {
                (Some(date), Some(description), Some(hours)) => {
                    debug!("{} - Duration: {} hours", debug_prefix, hours);
                    let hours = (hours * 100.0).round() / 100.0; // Round to 2 decimal places
                    debug!("{} - Rounded hours: {}", debug_prefix, hours);
                    // Normalize date to YYYY-MM-DD
                    let date_norm = if let Some(idx) = date.find('T') {
                        date[..idx].to_string()
                    } else {
                        date.clone()
                    };
                    Some(WorkHourEntry {
                        id: wh.id.to_string(),
                        date: date_norm,
                        description: description.clone(),
                        duration_hours: hours,
                    })
                },
                _ => {
                    debug!("{} - Skipping entry with missing data: date={:?}, description={:?}, duration={:?}",
                        debug_prefix, wh.date, wh.description, wh.duration_hours);
                    None
                }
            }
        })
        .collect()
}

/// Calculates total hours from a list of work hour entries
pub fn calculate_total_hours(entries: &[WorkHourEntry]) -> f64 {
    entries.iter().map(|wh| wh.duration_hours).sum::<f64>()
}

/// Logs work hour entries for debugging
pub fn log_work_entries(entries: &[WorkHourEntry], prefix: &str) {
    debug!("{} work hours entries:", prefix);
    for (i, entry) in entries.iter().enumerate() {
        debug!(
            "  Entry {}: Date={}, Description={}, Hours={}",
            i + 1,
            entry.date,
            entry.description,
            entry.duration_hours
        );
    }
}

/// Extracts and verifies user ID from Authorization header
pub fn extract_user_id_from_headers(headers: &HeaderMap) -> Result<String, StatusCode> {
    let auth_header = headers
        .get("authorization")
        .ok_or(StatusCode::UNAUTHORIZED)?
        .to_str()
        .map_err(|_| StatusCode::UNAUTHORIZED)?
        .strip_prefix("Bearer ")
        .ok_or(StatusCode::UNAUTHORIZED)?;

    info!(
        "Auth: Verifying token: {}...",
        &auth_header[..std::cmp::min(auth_header.len(), 20)]
    );

    match auth::verify_token(auth_header) {
        Ok(claims) => {
            info!("Auth: Token valid, user ID: {}", claims.sub);

            // Check for old numeric user IDs (should be Teable record IDs starting with "rec")
            if claims.sub == "0" || claims.sub.parse::<u32>().is_ok() {
                warn!("Auth: Old token format detected (numeric user ID), rejecting");
                return Err(StatusCode::UNAUTHORIZED);
            }

            Ok(claims.sub)
        }
        Err(e) => {
            warn!("Auth: Token verification failed: {:?}", e);
            Err(StatusCode::UNAUTHORIZED)
        }
    }
}

/// Checks if a member is eligible for work hours based on age restrictions
/// Rules: Mandatory for members aged 16-70, starting the year after turning 16
pub fn is_member_eligible_for_work_hours(member: &Member, current_year: i32) -> bool {
    debug!(
        "Called is_member_eligible_for_work_hours for {} {} (birth_date: {:?})",
        member.first_name, member.last_name, member.birth_date
    );
    let birth_date_str = &member.birth_date;
    if birth_date_str.trim().is_empty() {
        info!(
            "Age Check: Empty birth date for {} {}, assuming eligible",
            member.first_name, member.last_name
        );
    }

    use chrono::DateTime;

    // Try RFC3339 (e.g. 2019-10-08T22:21:36.000Z)
    if let Ok(dt) = DateTime::parse_from_rfc3339(birth_date_str) {
        let birth_date = dt.naive_utc().date();
        let birth_year = birth_date.year();
        let age_in_current_year = current_year - birth_year;
        let eligible = (17..70).contains(&age_in_current_year);
        debug!(
            "Age Check: {} {} - Birth: {}, Age in {}: {}, Eligible: {}",
            member.first_name,
            member.last_name,
            birth_date_str,
            current_year,
            age_in_current_year,
            eligible
        );
        return eligible;
    } else {
        warn!(
            "Age Check: Invalid birth date format for {} {}: '{}', assuming eligible",
            member.first_name, member.last_name, birth_date_str
        );
    }

    // If no birth date or invalid format, assume eligible (for backward compatibility)
    true
}

/// Gets work hours info including exemption reason for a member
pub fn get_member_work_hours_info(member: &Member, current_year: i32) -> (f64, Option<String>) {
    debug!(
        "Called get_member_work_hours_info for {} {} (birth_date: {:?}, join_date: {:?})",
        member.first_name, member.last_name, member.birth_date, member.join_date
    );

    // Check age eligibility first
    if !is_member_eligible_for_work_hours(member, current_year) {
        debug!(
            "Member {} {} is exempt due to age",
            member.first_name, member.last_name
        );
        return (0.0, Some("Altersbefreiung".to_string()));
    }

    // Check if joined after July 1st (half year)
    if let Some(join_date_str) = &member.join_date {
        debug!("Processing join date: {}", join_date_str);
        if let Ok(join_date) =
            chrono::NaiveDate::parse_from_str(join_date_str, "%Y-%m-%d").or_else(|_| {
                chrono::NaiveDateTime::parse_from_str(join_date_str, "%Y-%m-%dT%H:%M:%S%.fZ")
                    .map(|dt| dt.date())
            })
        {
            let july_first = chrono::NaiveDate::from_ymd_opt(current_year, 7, 1).unwrap();
            debug!(
                "Join date: {}, July 1st {}: {}",
                join_date, current_year, july_first
            );
            if join_date >= july_first {
                debug!(
                    "Member {} {} is exempt due to late entry",
                    member.first_name, member.last_name
                );
                return (0.0, Some("Eintritt nach Halbjahr".to_string()));
            }
        } else {
            debug!("Failed to parse join date: {}", join_date_str);
        }
    } else {
        debug!(
            "No join date found for member {} {}",
            member.first_name, member.last_name
        );
    }

    // Member is eligible and joined before July 1st
    debug!(
        "Member {} {} has 8 hours required",
        member.first_name, member.last_name
    );
    (8.0, None)
}
