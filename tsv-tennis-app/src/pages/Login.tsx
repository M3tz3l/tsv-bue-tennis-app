//Login.tsx

import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { LockClosedIcon } from "@heroicons/react/24/solid";
import { toast } from "react-toastify";
import TSVLogo from "../assets/TSV_Tennis.svg";

const Login = () => {
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsLoading(true);
        
        const data = new FormData(e.currentTarget);
        const email = data.get("email") as string;
        const password = data.get("password") as string;

        try {
            const result = await login(email, password);
            
            if (result.success) {
                toast.success("Anmeldung erfolgreich! Willkommen zurück.");
                navigate("/dashboard");
            } else {
                toast.error(result.message || "Anmeldung fehlgeschlagen. Bitte überprüfen Sie Ihre Anmeldedaten.");
            }
        } catch (error) {
            toast.error("Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es erneut.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center py-12 px-4 bg-gradient-to-br from-green-50 to-blue-50">
            <div className="max-w-md w-full">
                <div className="bg-white rounded-xl shadow-xl p-8 backdrop-blur-sm border border-white/20 ring-1 ring-black/5">
                    <div className="flex flex-col items-center">
                        <div className="mx-auto flex items-center justify-center mb-4">
                            <img 
                                src={TSVLogo} 
                                alt="TSV Tennis Logo" 
                                className="h-20 w-auto drop-shadow-md hover:drop-shadow-lg transition-all duration-300"
                            />
                        </div>
                        <h2 className="mt-2 text-center text-3xl font-bold text-gray-900">
                            Willkommen zurück
                        </h2>
                        <p className="mt-2 text-center text-sm text-gray-600">
                            Melden Sie sich in Ihrem TSV Tennis Konto an
                        </p>
                    </div>

                    <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                        <div className="space-y-4">
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
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white shadow-sm transition-all duration-200 placeholder:text-gray-400"
                                    placeholder="Ihre E-Mail-Adresse eingeben"
                                />
                            </div>
                            <div>
                                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                                    Passwort
                                </label>
                                <input
                                    id="password"
                                    name="password"
                                    type="password"
                                    autoComplete="current-password"
                                    required
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white shadow-sm transition-all duration-200 placeholder:text-gray-400"
                                    placeholder="Ihr Passwort eingeben"
                                />
                            </div>
                        </div>

                        <div>
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 disabled:from-gray-400 disabled:to-gray-500 text-white font-semibold py-3 px-6 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-0.5 hover:scale-[1.02] disabled:transform-none disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                            >
                                {isLoading ? (
                                    <div className="flex items-center justify-center">
                                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                                        Anmelden...
                                    </div>
                                ) : (
                                    'Anmelden'
                                )}
                            </button>
                        </div>

                        <div className="text-center">
                            <a
                                href="/forgotPassword"
                                className="text-sm font-medium text-green-600 hover:text-green-500 transition-colors duration-200"
                            >
                                Passwort vergessen?
                            </a>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default Login;