import { Toaster } from "./components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import Chat from './pages/Chat';
import Settings from './pages/Settings';
import Premium from './pages/Premium';
import Codex from './pages/Code';
import Artifacts from './pages/Artifacts';
import Images from './pages/Images';
import MusicPage from './pages/Music';
import { MusicProvider } from '@/lib/MusicContext';
import MiniPlayer from './components/xyron/music/MiniPlayer';
import Admin from './pages/Admin';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import XyronStudio from './pages/XyronStudio';
import XyronOS from './pages/XyronOS';
import XyronIntelligence from './pages/XyronIntelligence';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import BroadcastNotifier from './components/BroadcastNotifier';
import XyronLabsHost from './components/xyron/XyronLabsModal';
import MyProjects from './pages/MyProjects';
import Deactivated from './pages/Deactivated';
import InstallAppPrompt from './components/InstallAppPrompt';

const AuthenticatedApp = () => (
  <Routes>
    <Route path="/deactivated" element={<Deactivated />} />
    <Route path="/login" element={<Login />} />
    <Route path="/register" element={<Register />} />
    <Route path="/forgot-password" element={<ForgotPassword />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/" element={<Chat />} />
    <Route path="/settings" element={<Settings />} />
    <Route path="/premium" element={<Premium />} />
    <Route path="/legacy-studio" element={<XyronStudio />} />
    <Route path="/os" element={<XyronOS />} />
    <Route path="/intelligence" element={<XyronIntelligence />} />
    <Route path="/share" element={<XyronStudio />} />
    <Route path="/codex" element={<Codex />} />
    <Route path="/my-projects" element={<MyProjects />} />
    <Route path="/artifacts" element={<Artifacts />} />
    <Route path="/images" element={<Images />} />
    <Route path="/anime" element={<Navigate to="/images" replace />} />
    <Route path="/music" element={<MusicPage />} />
    <Route path="/admin" element={<Admin />} />
    <Route path="/privacy" element={<Privacy />} />
    <Route path="/terms" element={<Terms />} />
    <Route path="*" element={<PageNotFound />} />
  </Routes>
);

function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ScrollToTop />
          <MusicProvider>
            <AuthenticatedApp />
            <MiniPlayer />
          </MusicProvider>
          <BroadcastNotifier />
          <InstallAppPrompt />
          <XyronLabsHost />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
