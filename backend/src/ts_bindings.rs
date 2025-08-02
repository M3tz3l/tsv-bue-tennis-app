// This test generates TypeScript definitions
#[cfg(test)]
mod tests {
    use ts_rs::TS;
    use crate::models::*;

    #[test]
    fn export_typescript_bindings() {
        // This will generate TypeScript files when running `cargo test`
        LoginRequest::export();
        LoginResponse::export();
        RegisterRequest::export();
        ForgotPasswordRequest::export();
        ResetPasswordRequest::export();
        UserResponse::export();
        CreateWorkHourRequest::export();
        UpdateWorkHourRequest::export();
        WorkHourResponse::export();
        DashboardResponse::export();
        FamilyData::export();
        PersonalData::export();
        FamilyMember::export();
        MemberContribution::export();
        WorkHourEntry::export();
        
        println!("✅ TypeScript bindings exported to bindings/ directory");
    }
}
