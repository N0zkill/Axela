import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import './SignIn.css';
import logoSmallImg from '../assets/logo_small.png';

export default function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { toast } = useToast();
  const { signUp } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // Basic validation
    if (!email || !password || !confirmPassword) {
      setError('Please fill in all fields.');
      setIsLoading(false);
      return;
    }

    if (!email.includes('@')) {
      setError('Please enter a valid email address');
      setIsLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      setIsLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    try {
      // Use Supabase to create account
      const { user } = await signUp(email, password);

      toast({
        title: "Account created!",
        description: user?.email_confirmed_at
          ? `Welcome to Axela, ${email}!`
          : `Account created! Please check your email to confirm your account.`,
      });

      // If email confirmation is required, redirect to signin
      // If auto-confirmed, user will be automatically signed in
      if (!user?.email_confirmed_at) {
        navigate('/signin');
      } else {
        navigate('/');
      }
    } catch (err) {
      console.error('Sign up error:', err);
      setError(err.message || 'Failed to create account. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignIn = () => {
    navigate('/signin');
  };

  return (
    <div className="signin-page">
      <div className="login-wrapper">
        <div className="login-box">
          <a href="/">
            <img
              src={logoSmallImg}
              alt="Axela Logo"
              className="mx-auto mb-6 w-16 h-auto"
            />
          </a>
          <h2>Create Account</h2>
          <p className="subtitle">Sign up for your new account</p>

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
                placeholder="Create a password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className="input-group">
              <label>Confirm Password</label>
              <input
                type="password"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <button type="submit" disabled={isLoading}>
              {isLoading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>

          <div className="link-section">
            <p className="signup-text">
              Already have an account?{' '}
              <a href="/signin" className="signup-link" onClick={(e) => { e.preventDefault(); handleSignIn(); }}>
                Sign In
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
