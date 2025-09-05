//Login.tsx

import { useState, FormEvent, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { MemberSelection } from "../components/MemberSelection";
import { toast } from "react-toastify";
import TSVLogo from "../assets/TSV_Tennis.svg";
import { EyeIcon, EyeSlashIcon, InformationCircleIcon, KeyIcon, XMarkIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import type { UserResponse } from "@/types";

const Login = () => {
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [showMemberSelection, setShowMemberSelection] = useState<boolean>(false);
    const [users, setUsers] = useState<UserResponse[]>([]);
    const [selectionToken, setSelectionToken] = useState<string>('');
    const [showPassword, setShowPassword] = useState<boolean>(false);
    const [showTooltip, setShowTooltip] = useState<boolean>(false);
    const [showBanner, setShowBanner] = useState<boolean>(() => {
        return localStorage.getItem('hideLoginBanner') !== 'true';
    });
    const [hoverEnabled, setHoverEnabled] = useState<boolean>(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const dismissBanner = () => {
        setShowBanner(false);
        localStorage.setItem('hideLoginBanner', 'true');
    };

    // Detect if the current device supports hover (to avoid hover handlers on touch devices)
    useEffect(() => {
        if (typeof window !== 'undefined' && 'matchMedia' in window) {
            try {
                setHoverEnabled(window.matchMedia('(hover: hover)').matches);
            } catch (e) {
                setHoverEnabled(false);
            }
        }
    }, []);

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsLoading(true);

        const data = new FormData(e.currentTarget);
        const email = data.get("email") as string;
        const password = data.get("password") as string;

        try {
            const result = await login(email, password);

            if (result.success) {
                // Check if this is a multi-member selection response
                if ('multiple' in result && result.multiple && result.users && result.selectionToken) {
                    // Show member selection dialog
                    setUsers(result.users);
                    setSelectionToken(result.selectionToken);
                    setShowMemberSelection(true);
                    setIsLoading(false);
                } else {
                    // Single user login successful
                    toast.success("Anmeldung erfolgreich! Willkommen zurück.");
                    navigate("/dashboard");
                }
            } else {
                toast.error(result.message || "Anmeldung fehlgeschlagen. Bitte überprüfen Sie Ihre Anmeldedaten.");
            }
        } catch (error) {
            toast.error("Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es erneut.");
        } finally {
            if (!showMemberSelection) {
                setIsLoading(false);
            }
        }
    };

    const handleMemberSelectionComplete = () => {
        setShowMemberSelection(false);
        toast.success("Anmeldung erfolgreich! Willkommen zurück.");
        navigate("/dashboard");
    };

    const handleMemberSelectionCancel = () => {
        setShowMemberSelection(false);
        setUsers([]);
        setSelectionToken('');
    };

    return (
        <>
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
                                Willkommen
                            </h2>
                            <p className="mt-2 text-center text-sm text-gray-600">
                                Melden Sie sich in Ihrem TSV BÜ Tennis Konto zur Arbeitsstundendokumentation an.
                            </p>

                            {showBanner && (
                                <div className="mt-6 mb-4 p-4 bg-amber-50 border-l-4 border-amber-400 rounded-r-md">
                                    <div className="flex">
                                        <ExclamationTriangleIcon className="h-5 w-5 text-amber-400 mt-0.5" />
                                        <div className="ml-3 flex-1">
                                            <p className="text-sm text-amber-800">
                                                <strong>Erstanmeldung:</strong> Nutzen Sie "Passwort zurücksetzen" mit Ihrer registrierten E-Mail-Adresse.
                                            </p>
                                        </div>
                                        <button
                                            onClick={dismissBanner}
                                            className="ml-3 text-amber-400 hover:text-amber-600 focus:outline-none"
                                            aria-label="Banner schließen"
                                        >
                                            <XMarkIcon className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            )}

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
                                        <div className="flex items-center mb-2">
                                            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                                                Passwort
                                            </label>
                                            <div className="relative ml-2">
                                                <InformationCircleIcon
                                                    className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-pointer"
                                                    onClick={() => setShowTooltip(!showTooltip)}
                                                    {...(hoverEnabled ? {
                                                        onMouseEnter: () => setShowTooltip(true),
                                                        onMouseLeave: () => setShowTooltip(false)
                                                    } : {})}
                                                />
                                                {showTooltip && (
                                                    <div className="absolute left-0 top-6 w-64 p-2 bg-gray-800 text-white text-xs rounded-md shadow-lg z-10">
                                                        <div className="flex justify-between items-start">
                                                            <span>Bitte setzen Sie Ihr Passwort zurück, bevor Sie sich zum ersten Mal anmelden.</span>
                                                            <button
                                                                onClick={() => setShowTooltip(false)}
                                                                className="ml-2 text-gray-400 hover:text-white"
                                                            >
                                                                <XMarkIcon className="h-4 w-4" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="relative">
                                            <input
                                                id="password"
                                                name="password"
                                                type={showPassword ? 'text' : 'password'}
                                                autoComplete="current-password"
                                                required
                                                className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white shadow-sm transition-all duration-200 placeholder:text-gray-400"
                                                placeholder="Ihr Passwort eingeben"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none focus:text-gray-600"
                                                aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
                                            >
                                                {showPassword ? (
                                                    <EyeSlashIcon className="h-5 w-5" />
                                                ) : (
                                                    <EyeIcon className="h-5 w-5" />
                                                )}
                                            </button>
                                        </div>
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
                                        className="inline-flex items-center text-base font-semibold text-green-600 hover:text-green-700 transition-colors duration-200 hover:underline"
                                    >
                                        <KeyIcon className="h-5 w-5 mr-2" />
                                        Passwort zurücksetzen
                                    </a>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>

            </div>

            {showMemberSelection && (
                <MemberSelection
                    users={users}
                    selectionToken={selectionToken}
                    onComplete={handleMemberSelectionComplete}
                    onCancel={handleMemberSelectionCancel}
                />
            )}
        </>
    );
};

export default Login;