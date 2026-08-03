//ResetPassword.tsx 

import {
    useSearchParams,
    useNavigate,
    Link
} from "react-router-dom";
import { toast } from "react-toastify";
import BackendService from "../services/backendService";
import AuthPageLayout from '@/components/AuthPageLayout';

const ResetPassword = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const userId = searchParams.get("id");
    const token = searchParams.get("token");

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const newPasswordValue = data.get("newpassword");
        const confirmPasswordValue = data.get("confirmpassword");
        const newpassword = typeof newPasswordValue === 'string' ? newPasswordValue : '';
        const confirmpassword = typeof confirmPasswordValue === 'string' ? confirmPasswordValue : '';
        if (newpassword !== confirmpassword) {
            toast.error(`Neues Passwort und Passwort bestätigen stimmen nicht überein!`, {
                autoClose: 5000,
                position: "top-right",
            });
        } else {
            const res = await BackendService.resetPassword(String(token ?? ""), newpassword, String(userId ?? ""));
            if (res.success === false) {
                toast.error(res.message, {
                    autoClose: 5000,
                    position: "top-right",
                });
            } else {
                toast.success(res.message, {
                    autoClose: 5000,
                    position: "top-right",
                });
                setTimeout(() => {
                    void navigate("/login");
                }, 2000);
            }
        }
    };

    return (
        <AuthPageLayout title="Passwort zurücksetzen" description="Wählen Sie ein sicheres Passwort für Ihr Konto">
                    <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="newpassword" className="block text-sm font-medium text-[var(--body)] mb-2">
                                    Neues Passwort
                                </label>
                                <input
                                    id="newpassword"
                                    name="newpassword"
                                    type="password"
                                    required
                                    autoFocus
                                    className="w-full px-4 py-3 border border-[var(--hairline-strong)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent bg-white transition-all duration-200"
                                    placeholder="Ihr neues Passwort eingeben"
                                />
                            </div>
                            <div>
                                <label htmlFor="confirmpassword" className="block text-sm font-medium text-[var(--body)] mb-2">
                                    Passwort bestätigen
                                </label>
                                <input
                                    id="confirmpassword"
                                    name="confirmpassword"
                                    type="password"
                                    required
                                    className="w-full px-4 py-3 border border-[var(--hairline-strong)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent bg-white transition-all duration-200"
                                    placeholder="Ihr neues Passwort bestätigen"
                                />
                            </div>
                        </div>

                        <div>
                            <button
                                type="submit"
                                className="w-full bg-[var(--primary)] hover:bg-[var(--primary-active)] text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200"
                            >
                                Passwort aktualisieren
                            </button>
                        </div>

                        <div className="text-center">
                            <Link
                                to="/login"
                                className="text-sm font-medium text-[var(--primary)] hover:text-[var(--primary-active)] transition-colors duration-200"
                            >
                                ← Zurück zur Anmeldung
                            </Link>
                        </div>
                    </form>
        </AuthPageLayout>
    );
};

export default ResetPassword;
