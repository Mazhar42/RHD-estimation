import { motion } from "framer-motion";
import LoginForm from "../../components/auth/LoginForm.jsx";

const LoginPage = () => {
  const handleAuthSuccess = () => {};

  return (
    <div className="min-h-screen bg-white flex">
      <div className="w-full flex items-start justify-center">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-2xl px-8 py-16"
        >
          <LoginForm onSuccess={handleAuthSuccess} />
          <p className="mt-6 text-sm text-slate-500">
            Need access? Ask an administrator to send you an invite.
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default LoginPage;
