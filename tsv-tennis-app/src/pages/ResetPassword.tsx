//ResetPassword.tsx 

import {
    useSearchParams,
    useNavigate,
    Link
} from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { toast } from "react-toastify/unstyled";
import BackendService from "../services/backendService";
import AuthPageLayout from '@/components/AuthPageLayout';
import { buttonVariants, fieldControl } from "../styles/tokens";

const ResetPassword = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const userId = searchParams.get("id");
    const token = searchParams.get("token");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    useEffect(() => {
        return () => {
            clearTimeout(timerRef.current);
        };
    }, []);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
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
                    timerRef.current = setTimeout(() => {
                        void navigate("/login");
                    }, 2000);
                }
            }
        } finally {
            setIsSubmitting(false);
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
                                    className={`${fieldControl} border-[var(--hairline-strong)]`}
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
                                    className={`${fieldControl} border-[var(--hairline-strong)]`}
                                    placeholder="Ihr neues Passwort bestätigen"
                                />
                            </div>
                        </div>

                        <div>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className={`${buttonVariants.primary} w-full py-3`}
                            >
                                {isSubmitting ? 'Wird aktualisiert...' : 'Passwort aktualisieren'}
                            </button>
                        </div>

                        <div className="text-center">
                            <Link
                                to="/login"
                                className="text-sm font-medium text-[var(--primary-active)] hover:text-[var(--primary)] transition-colors duration-200"
                            >
                                ← Zurück zur Anmeldung
                            </Link>
                        </div>
                    </form>
        </AuthPageLayout>
    );
};

export default ResetPassword;
