import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import './SignIn.css';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { toast } = useToast();
  const { signIn, signInWithGoogle, signInWithGithub, isAuthenticated, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-950">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-white">Preparing your workspace...</span>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    // Basic validation
    if (!email || !password) {
      setError('Please enter both email and password.');
      setIsSubmitting(false);
      return;
    }

    if (!email.includes('@')) {
      setError('Please enter a valid email address');
      setIsSubmitting(false);
      return;
    }

    try {
      // Use Supabase authentication
      await signIn(email, password);

      toast({
        title: "Welcome back!",
        description: `Welcome, ${email}!`,
      });

      navigate('/');
    } catch (err) {
      console.error('Sign in error:', err);
      setError(err.message || 'Invalid email or password. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Social login handlers
  const handleGoogleLogin = async () => {
    try {
      setIsSubmitting(true);
      await signInWithGoogle();
    } catch (err) {
      console.error('Google login error:', err);
      toast({
        title: "Google Login Error",
        description: err.message || "Failed to sign in with Google",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGithubLogin = async () => {
    try {
      setIsSubmitting(true);
      await signInWithGithub();
    } catch (err) {
      console.error('GitHub login error:', err);
      toast({
        title: "GitHub Login Error",
        description: err.message || "Failed to sign in with GitHub",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignUp = () => {
    navigate('/signup');
  };

  return (
    <div className="signin-page">
      <div className="login-wrapper">
        <div className="login-box">
          <a href="/">
            <img 
              src="/src/assets/logo_small.png" 
              alt="Axela Logo" 
              className="mx-auto mb-6 w-16 h-auto" 
            />
          </a>
          <h2>Welcome Back</h2>
          <p className="subtitle">Sign in to your account</p>

          {error && (
            <div style={{ 
              color: '#ff6b6b', 
              backgroundColor: '#2d1b1b', 
              border: '1px solid #ff6b6b', 
              padding: '10px', 
              borderRadius: '8px', 
              marginBottom: '20px',
              fontSize: '0.9rem'
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <label>Email</label>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <div className="input-group">
              <label>Password</label>
              <input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in...' : 'Login'}
            </button>
          </form>

          <div className="link-section">
            <p className="signup-text">
              New? <a href="/signup" className="signup-link" onClick={(e) => { e.preventDefault(); handleSignUp(); }}>Create Account</a>
            </p>
          </div>

          <div className="divider">
            <span>or</span>
          </div>

          <div className="social-login">
            <button className="google-btn" onClick={handleGoogleLogin} disabled={isSubmitting}>
              <img
                src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/google/google-original.svg"
                alt="Google"
              />
              Sign in with Google
            </button>

            <button className="github-btn" onClick={handleGithubLogin} disabled={isSubmitting}>
              <img
                src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/github/github-original.svg"
                alt="GitHub"
              />
              Sign in with GitHub
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
