import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';

import Button from '../../shared/components/FormElements/Button';
import { supabase } from '../../shared/lib/supabase';

import './Auth.css';

const MODE = { LOGIN: 'login', SIGNUP: 'signup', FORGOT: 'forgot' };

const Auth = () => {
    const navigate = useNavigate();
    const [mode, setMode] = useState(MODE.LOGIN);
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { register, handleSubmit, setValue, formState: { errors } } = useForm();

    const isLogin  = mode === MODE.LOGIN;
    const isSignup = mode === MODE.SIGNUP;
    const isForgot = mode === MODE.FORGOT;

    const onSubmit = async (data) => {
        setErrorMessage('');
        setSuccessMessage('');
        setIsSubmitting(true);

        const email = data.emailRequired.trim();
        const password = data.passwordRequired;

        if (isLogin) {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            setIsSubmitting(false);
            if (error) { setErrorMessage(error.message); return; }
            // App's onAuthStateChange listener flips isLoggedIn → routes re-render.
        } else if (isSignup) {
            const { data: signUpData, error } = await supabase.auth.signUp({ email, password });
            setIsSubmitting(false);
            if (error) { setErrorMessage(error.message); return; }
            if (!signUpData.session) {
                setErrorMessage('Check your email to confirm your account.');
                return;
            }
            navigate('/welcome/info');
        } else if (isForgot) {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/password-reset`,
            });
            setIsSubmitting(false);
            if (error) { setErrorMessage(error.message); return; }
            setSuccessMessage('Check your email for a password reset link.');
        }
    };

    const switchMode = (next) => {
        setMode(next);
        setErrorMessage('');
        setSuccessMessage('');
        setValue('emailRequired', '');
        setValue('passwordRequired', '');
        errors.emailRequired = false;
        errors.passwordRequired = false;
    };

    const navJoin = () => navigate('/party/joinParty');

    const heading = isLogin  ? { title: 'Welcome Back', sub: 'Login to account' }
                   : isSignup ? { title: 'Welcome!',     sub: 'Create account' }
                   :            { title: 'Reset Password', sub: 'We\'ll email you a link' };

    const submitLabel = isLogin ? 'Login' : isSignup ? 'Create' : 'Send Reset Link';

    return (
        <div className='center'>
            <form onSubmit={handleSubmit(onSubmit)}>
                <img src="/img/Logo/choice-champ-title.png" alt="Choice Champ Logo" id="logo" />
                <div className='seperator' />

                <div>
                    <h3>{heading.title}</h3>
                    <h4>{heading.sub}</h4>
                </div>

                <input
                    className='text-input'
                    id="email"
                    type="email"
                    placeholder="Email"
                    autoComplete='email'
                    {...register('emailRequired', { required: true, pattern: /^\S+@\S+\.\S+$/ })}
                />
                {errors.emailRequired && <p className='error'>A valid email is required</p>}

                {!isForgot && (
                    <>
                        <input
                            className='text-input'
                            type='password'
                            id="password"
                            placeholder="Password"
                            autoComplete={isLogin ? 'current-password' : 'new-password'}
                            {...register('passwordRequired', { required: !isForgot, minLength: 6 })}
                        />
                        {errors.passwordRequired && <p className='error'>Password must be at least 6 characters</p>}
                    </>
                )}

                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? '...' : submitLabel}
                </Button>

                {errorMessage && <p className='auth-error-msg'>{errorMessage}</p>}
                {successMessage && <p className='auth-error-msg' style={{ color: '#45B859' }}>{successMessage}</p>}

                <div className='switch'>
                    {isLogin && (
                        <div>
                            <p onClick={() => switchMode(MODE.FORGOT)} className="switch-link">Forgot password?</p>
                            <p>Don't have an account?</p>
                            <p onClick={() => switchMode(MODE.SIGNUP)} className="switch-link">Create Account</p>
                            <p onClick={navJoin} className="switch-link">Join Code</p>
                        </div>
                    )}
                    {isSignup && (
                        <div>
                            <p>Already have an account?</p>
                            <p onClick={() => switchMode(MODE.LOGIN)} className="switch-link">Login</p>
                        </div>
                    )}
                    {isForgot && (
                        <div>
                            <p onClick={() => switchMode(MODE.LOGIN)} className="switch-link">Back to Login</p>
                        </div>
                    )}
                </div>
            </form>
        </div>
    );
};

export default Auth;
