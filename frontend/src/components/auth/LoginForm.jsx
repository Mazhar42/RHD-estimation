import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../../hooks/useAuth.js';
import { AlertCircle } from 'lucide-react';

const LoginForm = ({ onSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { login, loading } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    try {
      await login(username, password);
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed. Please try again.');
    }
  };

  return (
  <div className="flex flex-col justify-center">
    <div className="flex items-center justify-between mb-12">
      <div className="flex items-center gap-2">
        <div className="text-3xl font-semibold tracking-tight text-gray-900">
          RHD
        </div>
        <div className="text-md text-gray-800"> - Cost Estimation System</div>
      </div>
    </div>
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
    >
      <div className="mb-8">
        <h2 className="text-2xl font-semibold text-gray-900">Login</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg"
          >
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </motion.div>
        )}

        <div>
          <input
            id="username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Email or username"
            disabled={loading}
            className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-500)] focus:border-transparent transition disabled:bg-gray-50 disabled:text-gray-500"
            required
          />
        </div>

        <div>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              disabled={loading}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-500)] focus:border-transparent transition disabled:bg-gray-50 disabled:text-gray-500"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
              disabled={loading}
            >
              {showPassword ? '👁' : '👁‍🗨'}
            </button>
          </div>
        </div>

        <motion.button
          type="submit"
          disabled={loading || !username || !password}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="inline-flex items-center justify-center px-4 py-1 bg-black text-white rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Signing in...' : 'Log in'}
        </motion.button>
      </form>
    </motion.div>
  </div>
  );
};

export default LoginForm;
