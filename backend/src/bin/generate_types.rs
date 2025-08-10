//! TypeScript bindings generator for the TSV Tennis backend
//!
//! This binary generates TypeScript definitions from Rust types using Specta.
//! Run with: `cargo run --bin generate-types`

use specta::ts;
use std::path::Path;
use tracing::{debug, info};

// Import the types we want to export
use tsv_tennis_backend::member_selection::*;
use tsv_tennis_backend::models::*;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    info!("Generating TypeScript bindings...");

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
    macro_rules! export_type {
        ($type:ty) => {
            typescript_code.push_str(&ts::export::<$type>(&Default::default())?);
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
    export_type!(UpdateWorkHourRequest);
    export_type!(WorkHourResponse);
    export_type!(DashboardResponse);
    export_type!(FamilyData);
    export_type!(PersonalData);
    export_type!(FamilyMember);
    export_type!(MemberContribution);
    export_type!(WorkHourEntry);

    // Write to file
    std::fs::write(&output_path, typescript_code)?;

    info!("TypeScript bindings exported to {}", output_path.display());
    debug!(
        "Copy to frontend with: cp {} ../tsv-tennis-app/src/types/",
        output_path.display()
    );

    Ok(())
}
