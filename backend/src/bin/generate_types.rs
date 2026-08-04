//! TypeScript bindings generator for the TSV Tennis backend
//!
//! This binary generates TypeScript definitions from Rust types using Specta.
//! Run with: `cargo run --bin generate-types`

use specta::ts::{self, BigIntExportBehavior};
use std::path::Path;

// Import the types we want to export
use tsv_tennis_backend::member_selection::*;
use tsv_tennis_backend::models::*;

fn main() -> anyhow::Result<()> {
    println!("🔄 Generating TypeScript bindings...");

    // Create bindings directory
    let bindings_dir = Path::new("bindings");
    std::fs::create_dir_all(bindings_dir)?;
    let output_path = bindings_dir.join("types.ts");

    // Export each type individually and collect the TypeScript code
    let mut typescript_code = String::new();

    // Add header comment
    typescript_code.push_str("// Auto-generated TypeScript definitions from Rust using Specta\n");
    typescript_code.push_str("// Generated with: cargo run --bin generate-types\n\n");

    // Define a macro to reduce repetition
    let export_config = ts::ExportConfiguration::new().bigint(BigIntExportBehavior::Number);

    macro_rules! export_type {
        ($type:ty) => {
            typescript_code.push_str(&ts::export::<$type>(&export_config)?);
            typescript_code.push_str("\n\n");
        };
    }

    // Export all types
    export_type!(LoginRequest);
    export_type!(LoginResponse);
    export_type!(LoginResponseVariant);
    export_type!(MemberSelectionResponse);
    export_type!(SelectMemberRequest);
    export_type!(RegisterRequest);
    export_type!(ForgotPasswordRequest);
    export_type!(ResetPasswordRequest);
    export_type!(UserResponse);
    export_type!(CreateWorkHourRequest);
    export_type!(WorkHourResponse);
    export_type!(DashboardResponse);
    export_type!(FamilyData);
    export_type!(PersonalData);
    export_type!(FamilyMember);
    export_type!(MemberContribution);
    export_type!(WorkHourEntry);
    export_type!(RecipientFilter);
    export_type!(SendBulkMailRequest);
    export_type!(MailJob);
    export_type!(MailJobStatus);
    export_type!(EventType);
    export_type!(EventStatus);
    export_type!(CreateEventRequest);
    export_type!(UpdateEventRequest);
    export_type!(SignupRequest);
    export_type!(EventSummary);
    export_type!(EventDetail);
    export_type!(EventSignup);
    export_type!(SignupSummary);

    // Write to file
    std::fs::write(&output_path, typescript_code)?;

    println!(
        "✅ TypeScript bindings exported to {}",
        output_path.display()
    );
    println!(
        "💡 Copy to frontend with: cp {} ../tsv-tennis-app/src/types/",
        output_path.display()
    );

    Ok(())
}
