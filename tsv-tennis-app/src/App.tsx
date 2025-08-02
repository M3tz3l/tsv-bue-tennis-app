import {
    BrowserRouter,
    Navigate,
    Route,
    Routes
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import 'react-toastify/dist/ReactToastify.css';
import { ToastContainer } from "react-toastify";

// Create a client for TanStack Query
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: 1,
            refetchOnWindowFocus: false,
        },
    },
});

const App = () => {
    return (
        <QueryClientProvider client={queryClient}>
            <AuthProvider>
                <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
                    <ToastContainer 
                        position="top-right"
                        autoClose={5000}
                        hideProgressBar={false}
                        newestOnTop={false}
                        closeOnClick
                        rtl={false}
                        pauseOnFocusLoss
                        draggable
                        pauseOnHover
                        theme="light"
                    />
                    <BrowserRouter>
                        <Routes>
                            <Route path="/" 
                                   element={<Navigate to="/login" />} />
                            <Route path="/login" element={<Login />} />
                            <Route path="/forgotPassword" 
                                   element={<ForgotPassword />} />
                            <Route path="/resetPassword" 
                                   element={<ResetPassword />} />
                            <Route path="/dashboard" 
                                   element={
                                       <ProtectedRoute>
                                           <Dashboard />
                                       </ProtectedRoute>
                                   } />
                        </Routes>
                    </BrowserRouter>
                </div>
            </AuthProvider>
        </QueryClientProvider>
    );
};

export default App;