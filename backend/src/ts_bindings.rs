// This test generates TypeScript definitions
#[cfg(test)]
mod tests {
    use crate::member_selection::*;
    use crate::models::*;
    use ts_rs::TS;

    #[test]
    fn export_typescript_bindings() {
        // This will generate TypeScript files when running `cargo test`
        let _ = LoginRequest::export();
        let _ = LoginResponse::export();
        let _ = LoginResponseVariant::export();
        let _ = MemberSelectionResponse::export();
        let _ = SelectMemberRequest::export();
        let _ = RegisterRequest::export();
        let _ = ForgotPasswordRequest::export();
        let _ = ResetPasswordRequest::export();
        let _ = UserResponse::export();
        let _ = CreateWorkHourRequest::export();
        let _ = UpdateWorkHourRequest::export();
        let _ = WorkHourResponse::export();
        let _ = DashboardResponse::export();
        let _ = FamilyData::export();
        let _ = PersonalData::export();
        let _ = FamilyMember::export();
        let _ = MemberContribution::export();
        let _ = WorkHourEntry::export();

        println!("✅ TypeScript bindings exported to bindings/ directory");
    }
}
