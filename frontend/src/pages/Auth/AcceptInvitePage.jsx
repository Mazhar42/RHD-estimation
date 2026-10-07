import { motion } from "framer-motion";
import AcceptInviteForm from "../../components/auth/AcceptInviteForm.jsx";

const AcceptInvitePage = () => {
  return (
    <div className="min-h-screen bg-white flex">
      <div className="w-full flex items-start justify-center">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-2xl px-8 py-16"
        >
          <AcceptInviteForm />
        </motion.div>
      </div>
    </div>
  );
};

export default AcceptInvitePage;
