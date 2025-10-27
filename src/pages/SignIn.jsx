import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import './SignIn.css';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { toast } = useToast();
  const { signIn } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // Basic validation
    if (!email || !password) {
      setError('Please enter both email and password.');
      setIsLoading(false);
      return;
    }

    if (!email.includes('@')) {
      setError('Please enter a valid email address');
      setIsLoading(false);
      return;
    }

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // For demo purposes, accept any email/password combination
      // In a real app, you would validate against your backend
      if (email && password) {
        toast({
          title: "Welcome back!",
          description: `Welcome, ${email}!`,
        });
        
        // Use the auth context to sign in
        signIn(email);
        
        navigate('/assistant');
      }
    } catch (err) {
      setError('Invalid email or password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Temporary social login handlers
  const handleGoogleLogin = () => {
    toast({
      title: "Google Login",
      description: "Google login coming soon!",
    });
  };

  const handleGithubLogin = () => {
    toast({
      title: "GitHub Login", 
      description: "GitHub login coming soon!",
    });
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
                disabled={isLoading}
              />
            </div>

            <div className="input-group">
              <label>Password</label>
              <input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <button type="submit" disabled={isLoading}>
              {isLoading ? 'Signing in...' : 'Login'}
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
            <button className="google-btn" onClick={handleGoogleLogin} disabled={isLoading}>
              <img
                src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/google/google-original.svg"
                alt="Google"
              />
              Sign in with Google
            </button>

            <button className="github-btn" onClick={handleGithubLogin} disabled={isLoading}>
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