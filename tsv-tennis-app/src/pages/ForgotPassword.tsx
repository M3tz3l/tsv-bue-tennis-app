//ForgotPassword.tsx

import { useState } from "react";
import { Link } from "react-router-dom";
import backendService from "../services/backendService";
import { toast } from "react-toastify";
import AuthPageLayout from '@/components/AuthPageLayout';
import { buttonVariants, fieldControl } from "../styles/tokens";

const ForgotPassword = () => {
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const data = new FormData(e.currentTarget);
            const emailValue = data.get("email");
            const email = typeof emailValue === 'string' ? emailValue : '';
            const res = await backendService.forgotPassword(email);
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
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <AuthPageLayout
            title="Passwort vergessen?"
            description="Kein Problem! Geben Sie Ihre E-Mail-Adresse ein und wir senden Ihnen einen Link zum Zurücksetzen Ihres Passworts."
        >
                    <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-[var(--body)] mb-2">
                                E-Mail-Adresse
                            </label>
                            <input
                                id="email"
                                name="email"
                                type="email"
                                autoComplete="email"
                                required
                                autoFocus
                                className={`${fieldControl} border-[var(--hairline-strong)]`}
                                placeholder="Ihre E-Mail-Adresse eingeben"
                            />
                        </div>

                        <div>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className={`${buttonVariants.primary} w-full py-3`}
                            >
                                {isSubmitting ? 'Wird gesendet...' : 'Reset-Link senden'}
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

export default ForgotPassword;
