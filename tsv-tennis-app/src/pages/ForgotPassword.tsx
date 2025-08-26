//ForgotPassword.tsx

import backendService from "../services/backendService";
import { toast } from "react-toastify";
import TSVLogo from "../assets/TSV_Tennis.svg";

const ForgotPassword = () => {
    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const email = String(data.get("email") ?? "");
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
        <div className="min-h-screen flex items-center justify-center py-12 px-4 bg-gradient-to-br from-green-50 to-blue-50">
            <div className="max-w-md w-full">
                <div className="bg-white rounded-xl shadow-xl p-8 backdrop-blur-sm border border-white/20">
                    <div className="flex flex-col items-center">
                        <div className="mx-auto flex items-center justify-center mb-4">
                            <img
                                src={TSVLogo}
                                alt="TSV Tennis Logo"
                                className="h-20 w-auto drop-shadow-md hover:drop-shadow-lg transition-all duration-300"
                            />
                        </div>
                        <h2 className="mt-2 text-center text-3xl font-bold text-gray-900">
                            Passwort vergessen?
                        </h2>
                        <p className="mt-2 text-center text-sm text-gray-600 max-w-sm">
                            Kein Problem! Geben Sie Ihre E-Mail-Adresse ein und wir senden Ihnen einen Link zum Zurücksetzen Ihres Passworts.
                        </p>
                    </div>

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
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white shadow-sm transition-all duration-200"
                                placeholder="Ihre E-Mail-Adresse eingeben"
                            />
                        </div>

                        <div>
                            <button
                                type="submit"
                                className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold py-3 px-6 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-0.5"
                            >
                                Reset-Link senden
                            </button>
                        </div>

                        <div className="text-center">
                            <a
                                href="/login"
                                className="text-sm font-medium text-green-600 hover:text-green-500 transition-colors duration-200"
                            >
                                ← Zurück zur Anmeldung
                            </a>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default ForgotPassword;