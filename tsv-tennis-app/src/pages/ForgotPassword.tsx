//ForgotPassword.tsx

import { Link } from "react-router-dom";
import backendService from "../services/backendService";
import { toast } from "react-toastify";
import AuthPageLayout from '@/components/AuthPageLayout';

const ForgotPassword = () => {
    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
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
    };

    return (
        <AuthPageLayout
            title="Passwort vergessen?"
            description="Kein Problem! Geben Sie Ihre E-Mail-Adresse ein und wir senden Ihnen einen Link zum Zurücksetzen Ihres Passworts."
        >
                    <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                                E-Mail-Adresse
                            </label>
                            <input
                                id="email"
                                name="email"
                                type="email"
                                autoComplete="email"
                                required
                                autoFocus
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white shadow-sm transition-all duration-200"
                                placeholder="Ihre E-Mail-Adresse eingeben"
                            />
                        </div>

                        <div>
                            <button
                                type="submit"
                                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200"
                            >
                                Reset-Link senden
                            </button>
                        </div>

                        <div className="text-center">
                            <Link
                                to="/login"
                                className="text-sm font-medium text-green-600 hover:text-green-500 transition-colors duration-200"
                            >
                                ← Zurück zur Anmeldung
                            </Link>
                        </div>
                    </form>
        </AuthPageLayout>
    );
};

export default ForgotPassword;
