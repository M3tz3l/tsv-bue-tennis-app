// Auto-generated TypeScript definitions from Rust using Specta
// Generated with: cargo run --bin generate-types

export type LoginRequest = { email: string; password: string }

export type LoginResponse = { success: boolean; token: string; user: UserResponse }

export type LoginResponseVariant = ({ type: "single" } & LoginResponse) | ({ type: "multiple" } & MemberSelectionResponse)

export type MemberSelectionResponse = { success: boolean; multiple: boolean; users: UserResponse[]; selection_token: string; message: string }

export type SelectMemberRequest = { member_id: string; selection_token: string | null }

export type RegisterRequest = { name: string; email: string; password: string }

export type ForgotPasswordRequest = { email: string }

export type ResetPasswordRequest = { token: string; password: string; id: string | null }

export type UserResponse = { id: string; name: string; email: string; role: string | null }

export type CreateWorkHourRequest = { Datum: string; Tätigkeit: string; Stunden: number }

export type WorkHourResponse = { id: string; date: string; description: string; duration_hours: number }

export type DashboardResponse = { success: boolean; family: FamilyData | null; personal: PersonalData | null; year: number }

export type FamilyData = { name: string; members: FamilyMember[]; required: number; completed: number; remaining: number; percentage: number; memberContributions: MemberContribution[] }

export type PersonalData = { name: string; hours: number; required: number; entries: WorkHourEntry[]; exemption_reason: string | null }

export type FamilyMember = { id: string; name: string; email: string }

export type MemberContribution = { id: string; name: string; hours: number; required: number; entries: WorkHourEntry[]; exemption_reason: string | null }

export type WorkHourEntry = { id: string; Datum: string; Tätigkeit: string; Stunden: number }

export type RecipientFilter = "all" | "active" | "orga"

export type SendBulkMailRequest = { subject: string; message: string; recipient_filter: RecipientFilter }

export type MailJob = { id: string; status: MailJobStatus; total_recipients: number; sent: number; failed: number; failed_recipients: string[]; error: string | null; created_at: string }

export type MailJobStatus = "pending" | "running" | "completed" | "failed"

export type EventType = "event" | "work-duty"

export type EventStatus = "draft" | "published"

export type CreateEventRequest = { type: EventType; title: string; description: string | null; event_date: string; start_time: string | null; end_time: string | null; location: string | null; signup_deadline: string | null; capacity: number | null; allow_salad: boolean; allow_cake: boolean; status: EventStatus }

export type UpdateEventRequest = { title: string | null; description: string | null; event_date: string | null; start_time: string | null; end_time: string | null; location: string | null; signup_deadline: string | null; capacity: number | null; clear_fields?: string[]; allow_salad: boolean | null; allow_cake: boolean | null; status: EventStatus | null }

export type SignupRequest = { people_count: number; salad_count: number; cake_count: number; comment: string | null }

export type EventSummary = { id: number; type: EventType; title: string; description: string | null; event_date: string; start_time: string | null; end_time: string | null; location: string | null; signup_deadline: string | null; capacity: number | null; allow_salad: boolean; allow_cake: boolean; status: EventStatus; signup_people_count: number }

export type EventDetail = { event: EventSummary; own_signup: EventSignup | null }

export type EventSignup = { id: number; event_id: number; member_id: string; member_name: string | null; people_count: number; salad_count: number; cake_count: number; comment: string | null }

export type SignupSummary = { signups: EventSignup[]; total_people: number; total_salad: number; total_cake: number }

