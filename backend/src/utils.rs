use crate::auth;
use crate::models::{Member, WorkHour, WorkHourEntry};
use axum::http::{HeaderMap, StatusCode};
use chrono::Datelike;
use tracing::info;

/// Converts seconds to hours with 2 decimal place precision
pub fn seconds_to_hours(seconds: f64) -> f64 {
    let hours = seconds / 3600.0;
    (hours * 100.0).round() / 100.0
}

/// Rounds a number to 2 decimal places
pub fn round_to_2_decimals(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

/// Filters and converts work hours for a specific user ID and year
pub fn filter_work_hours_for_user_by_year(
    work_hours: &[WorkHour],
    user_id: &str,
    year: i32,
    debug_prefix: &str,
) -> Vec<WorkHourEntry> {
    work_hours
        .iter()
        .filter(|wh| {
            // Try to match using the linked record field first, then fall back to UUID
            if let Some(member_id) = wh.get_member_id() {
                member_id == user_id
            } else if let Some(ref uuid) = wh.member_uuid {
                uuid == user_id
            } else {
                false
            }
        })
        .filter(|wh| {
            // Filter by year if date is available
            if let Some(ref date_str) = wh.date {
                // Date format is typically YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ
                if let Some(year_part) = date_str.split('-').next() {
                    if let Ok(entry_year) = year_part.parse::<i32>() {
                        return entry_year == year;
                    }
                }
            }
            false // If no date or parsing fails, exclude the entry
        })
        .filter_map(|wh| {
            match (&wh.date, &wh.description, wh.duration_seconds) {
                (Some(date), Some(description), Some(duration)) => {
                    info!("{} - Raw duration: {} seconds", debug_prefix, duration);
                    let hours = seconds_to_hours(duration);
                    info!("{} - Converted to hours: {}", debug_prefix, hours);
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
                    info!("{} - Skipping entry with missing data: date={:?}, description={:?}, duration={:?}",
                        debug_prefix, wh.date, wh.description, wh.duration_seconds);
                    None
                }
            }
        })
        .collect()
}

/// Calculates total hours from a list of work hour entries
pub fn calculate_total_hours(entries: &[WorkHourEntry]) -> f64 {
    let total = entries.iter().map(|wh| wh.duration_hours).sum::<f64>();
    round_to_2_decimals(total)
}

/// Logs work hour entries for debugging
pub fn log_work_entries(entries: &[WorkHourEntry], prefix: &str) {
    info!("{} work hours entries:", prefix);
    for (i, entry) in entries.iter().enumerate() {
        info!(
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
        "🔍 Auth: Verifying token: {}...",
        &auth_header[..std::cmp::min(auth_header.len(), 20)]
    );

    match auth::verify_token(auth_header) {
        Ok(claims) => {
            info!("✅ Auth: Token valid, user ID: {}", claims.sub);

            // Check for old numeric user IDs (should be Teable record IDs starting with "rec")
            if claims.sub == "0" || claims.sub.parse::<u32>().is_ok() {
                info!("🚨 Auth: Old token format detected (numeric user ID), rejecting");
                return Err(StatusCode::UNAUTHORIZED);
            }

            Ok(claims.sub)
        }
        Err(e) => {
            info!("🚨 Auth: Token verification failed: {:?}", e);
            Err(StatusCode::UNAUTHORIZED)
        }
    }
}

/// Checks if a member is eligible for work hours based on age restrictions
/// Rules: Mandatory for members aged 16-70, starting the year after turning 16
pub fn is_member_eligible_for_work_hours(member: &Member, current_year: i32) -> bool {
    info!(
        "🔍 [DEBUG] Called is_member_eligible_for_work_hours for {} {} (birth_date: {:?})",
        member.first_name, member.last_name, member.birth_date
    );
    if let Some(birth_date_str) = &member.birth_date {
        if birth_date_str.trim().is_empty() {
            info!(
                "🚨 Age Check: Empty birth date for {} {}, assuming eligible",
                member.first_name, member.last_name
            );
            return true;
        }

        use chrono::{DateTime, NaiveDate};

        // Try RFC3339 (e.g. 2019-10-08T22:21:36.000Z)
        if let Ok(dt) = DateTime::parse_from_rfc3339(birth_date_str) {
            let birth_date = dt.naive_utc().date();
            let birth_year = birth_date.year();
            let age_in_current_year = current_year - birth_year;
            let eligible = age_in_current_year >= 17 && age_in_current_year < 70;
            info!(
                "🔍 Age Check: {} {} - Birth: {}, Age in {}: {}, Eligible: {}",
                member.first_name,
                member.last_name,
                birth_date_str,
                current_year,
                age_in_current_year,
                eligible
            );
            return eligible;
        } else if let Ok(birth_date) = NaiveDate::parse_from_str(birth_date_str, "%Y-%m-%d") {
            let birth_year = birth_date.year();
            let age_in_current_year = current_year - birth_year;
            let eligible = age_in_current_year >= 17 && age_in_current_year < 70;
            info!(
                "🔍 Age Check: {} {} - Birth: {}, Age in {}: {}, Eligible: {}",
                member.first_name,
                member.last_name,
                birth_date_str,
                current_year,
                age_in_current_year,
                eligible
            );
            return eligible;
        } else {
            info!(
                "🚨 Age Check: Invalid birth date format for {} {}: '{}', assuming eligible",
                member.first_name, member.last_name, birth_date_str
            );
        }
    } else {
        info!(
            "🚨 Age Check: No birth date field for {} {}, assuming eligible",
            member.first_name, member.last_name
        );
    }
    // If no birth date or invalid format, assume eligible (for backward compatibility)
    true
}

/// Gets the required work hours for a member based on age eligibility
pub fn get_required_hours_for_member(member: &Member, current_year: i32) -> f64 {
    info!(
        "🔍 [DEBUG] Called get_required_hours_for_member for {} {} (birth_date: {:?})",
        member.first_name, member.last_name, member.birth_date
    );
    if is_member_eligible_for_work_hours(member, current_year) {
        8.0 // Standard required hours
    } else {
        0.0 // Not eligible, no hours required
    }
}
