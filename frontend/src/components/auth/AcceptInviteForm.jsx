import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertCircle } from 'lucide-react';
import { authAPI } from '../../api/auth';
import { useAuth } from '../../hooks/useAuth.js';

const AcceptInviteForm = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const { acceptInvite, loading } = useAuth();

  const [invite, setInvite] = useState(null);
  const [inviteError, setInviteError] = useState('');
  const [checkingInvite, setCheckingInvite] = useState(true);

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    fullName: '',
  });
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    authAPI
      .getInvite(token)
      .then((res) => {
        if (!cancelled) setInvite(res.data);
      })
      .catch(() => {
        if (!cancelled) setInviteError('This invite link is invalid or has expired. Ask an administrator to send a new one.');
      })
      .finally(() => {
        if (!cancelled) setCheckingInvite(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const validateForm = () => {
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return false;
    }
    if (formData.password.length < 12) {
      setError('Password must be at least 12 characters');
      return false;
    }
    if (!formData.username.trim()) {
      setError('Please choose a username');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!validateForm()) return;

    try {
      await acceptInvite(token, formData.username.trim(), formData.password, formData.fullName);
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not complete registration. Please try again.');
    }
  };

  if (checkingInvite) {
    return <div className="text-sm text-slate-500">Checking invite...</div>;
  }

  if (inviteError) {
    return (
      <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
        <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-red-700">
          {inviteError}
          <div className="mt-3">
            <Link to="/login" className="text-[var(--color-primary-700)] hover:text-[var(--color-primary-800)] font-medium">
              Back to login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="mb-8">
        <h2 className="text-2xl font-semibold text-gray-900">Set up your account</h2>
        <p className="mt-1 text-sm text-slate-600">
          You've been invited to RHD-CES as <span className="font-medium">{invite.email}</span>.
        </p>
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
            id="fullName"
            type="text"
            name="fullName"
            value={formData.fullName}
            onChange={handleChange}
            placeholder="Full name"
            disabled={loading}
            className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-500)] focus:border-transparent transition disabled:bg-gray-50"
          />
        </div>

        <div>
          <input
            id="username"
            type="text"
            name="username"
            value={formData.username}
            onChange={handleChange}
            placeholder="Choose a username"
            disabled={loading}
            className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-500)] focus:border-transparent transition disabled:bg-gray-50"
            required
          />
        </div>

        <div>
          <input
            id="password"
            type="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            placeholder="Create a password (12+ characters)"
            disabled={loading}
            className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-500)] focus:border-transparent transition disabled:bg-gray-50"
            required
          />
        </div>

        <div>
          <input
            id="confirmPassword"
            type="password"
            name="confirmPassword"
            value={formData.confirmPassword}
            onChange={handleChange}
            placeholder="Confirm your password"
            disabled={loading}
            className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-500)] focus:border-transparent transition disabled:bg-gray-50"
            required
          />
        </div>

        <motion.button
          type="submit"
          disabled={loading || !formData.username || !formData.password}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="inline-flex items-center justify-center px-6 py-2.5 bg-black text-white rounded-full text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Creating account...' : 'Create account'}
        </motion.button>
      </form>
    </motion.div>
  );
};

export default AcceptInviteForm;
