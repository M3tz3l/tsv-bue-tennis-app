//ResetPassword.tsx 

import {
    useSearchParams,
    useNavigate
} from "react-router-dom";
import { toast } from "react-toastify";
import TSVLogo from "../assets/TSV_Tennis.svg";
import BackendService from "../services/backendService";

const ResetPassword = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const userId = searchParams.get("id");
    const token = searchParams.get("token");

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const newpassword = String(data.get("newpassword") ?? "");
        const confirmpassword = String(data.get("confirmpassword") ?? "");
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
                    navigate("/login");
                }, 2000);
            }
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
                            Passwort zurücksetzen
                        </h2>
                        <p className="mt-2 text-center text-sm text-gray-600">
                            Wählen Sie ein sicheres Passwort für Ihr Konto
                        </p>
                    </div>

                    <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="newpassword" className="block text-sm font-medium text-gray-700 mb-2">
                                    Neues Passwort
                                </label>
                                <input
                                    id="newpassword"
                                    name="newpassword"
                                    type="password"
                                    required
                                    autoFocus
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white shadow-sm transition-all duration-200"
                                    placeholder="Ihr neues Passwort eingeben"
                                />
                            </div>
                            <div>
                                <label htmlFor="confirmpassword" className="block text-sm font-medium text-gray-700 mb-2">
                                    Passwort bestätigen
                                </label>
                                <input
                                    id="confirmpassword"
                                    name="confirmpassword"
                                    type="password"
                                    required
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white shadow-sm transition-all duration-200"
                                    placeholder="Ihr neues Passwort bestätigen"
                                />
                            </div>
                        </div>

                        <div>
                            <button
                                type="submit"
                                className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold py-3 px-6 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-0.5"
                            >
                                Passwort aktualisieren
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

export default ResetPassword;