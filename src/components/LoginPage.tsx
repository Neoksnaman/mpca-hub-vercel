import React, { useState, useContext } from 'react';
import { AppContext } from '../App';
import { loginWithUsernamePassword } from '../services/googleSheetsService';
import { Loader2, ShieldAlert, LogIn, User as UserIcon, Lock } from 'lucide-react';

const LoginPage: React.FC = () => {
    const context = useContext(AppContext);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            const user = await loginWithUsernamePassword(username, password);
            context?.setUser(user);
        } catch (err: any) {
            setError(err.message || 'Invalid username or password');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-light dark:bg-neutral-dark p-6 transition-colors duration-300">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl max-w-md w-full border border-neutral-medium dark:border-gray-700 animate-in fade-in zoom-in duration-300">
                <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-primary/20 rotate-3">
                    <span className="text-white text-3xl font-bold -rotate-3">M</span>
                </div>
                
                <div className="mb-8">
                    <h1 className="text-2xl font-bold text-neutral-dark dark:text-white text-center">MPCA Hub</h1>
                    <p className="text-sm text-secondary text-center mt-2">Internal Operations Portal</p>
                </div>
                
                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-neutral-dark dark:text-gray-300 mb-1.5 ml-1">Username</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-secondary">
                                <UserIcon size={18} />
                            </div>
                            <input 
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="block w-full pl-10 pr-3 py-2.5 bg-neutral-light/50 dark:bg-gray-900/50 border border-neutral-medium dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all dark:text-white"
                                placeholder="Enter your username"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-neutral-dark dark:text-gray-300 mb-1.5 ml-1">Password</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-secondary">
                                <Lock size={18} />
                            </div>
                            <input 
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="block w-full pl-10 pr-3 py-2.5 bg-neutral-light/50 dark:bg-gray-900/50 border border-neutral-medium dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all dark:text-white"
                                placeholder="••••••••"
                                required
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="bg-error/10 text-error p-3 rounded-lg text-sm flex items-center gap-2">
                            <AlertTriangle size={16} />
                            <span>{error}</span>
                        </div>
                    )}

                    <button 
                        type="submit"
                        disabled={isLoading}
                        className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white font-medium rounded-xl px-6 py-3 transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 mt-2"
                    >
                        {isLoading ? <Loader2 className="animate-spin" size={20} /> : <LogIn size={20} />}
                        <span>Sign In</span>
                    </button>
                </form>

                <div className="mt-8 pt-6 border-t border-neutral-medium dark:border-gray-700 text-center">
                    <p className="text-xs text-secondary dark:text-gray-500 italic">
                        Restricted Access. Unauthorized entry is logged and monitored.
                    </p>
                </div>
            </div>
            
            <footer className="mt-8 text-secondary/60 dark:text-gray-600 text-sm">
                &copy; 2024 MP Camaso and Associates
            </footer>
        </div>
    );
};

const AlertTriangle: React.FC<{ size?: number }> = ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" />
    </svg>
);

export default LoginPage;
