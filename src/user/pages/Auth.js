import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';

import Button from '../../shared/components/FormElements/Button';
import { supabase } from '../../shared/lib/supabase';

import './Auth.css';

const Auth = () => {
    const navigate = useNavigate();
    const [isLoginMode, setIsLoginMode] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { register, handleSubmit, setValue, formState: { errors } } = useForm();

    const onSubmit = async (data) => {
        setErrorMessage('');
        setIsSubmitting(true);

        const email = data.emailRequired.trim();
        const password = data.passwordRequired;

        if (isLoginMode) {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            setIsSubmitting(false);
            if (error) {
                setErrorMessage(error.message);
                return;
            }
            // App's onAuthStateChange listener will flip isLoggedIn and the route
            // re-renders, so no explicit navigate is needed here.
        } else {
            const { data: signUpData, error } = await supabase.auth.signUp({ email, password });
            setIsSubmitting(false);
            if (error) {
                setErrorMessage(error.message);
                return;
            }
            // If email confirmation is enabled in Supabase, session will be null until
            // the user confirms. In that case we leave them on the auth page with a note.
            if (!signUpData.session) {
                setErrorMessage('Check your email to confirm your account.');
                return;
            }
            navigate('/welcome/info');
        }
    };

    const switchModeHandler = () => {
        setIsLoginMode(prev => !prev);
        setErrorMessage('');
        setValue('emailRequired', '');
        setValue('passwordRequired', '');
        errors.emailRequired = false;
        errors.passwordRequired = false;
    };

    const navJoin = () => navigate('/party/joinParty');

    return (
        <div className='center'>
            <form onSubmit={handleSubmit(onSubmit)}>

                <img src={`${process.env.PUBLIC_URL}/img/Logo/choice-champ-title.png`} alt="Choice Champ Logo" id="logo" />

                <div className='seperator' />

                {isLoginMode && (
                    <div>
                        <h3>Welcome Back</h3>
                        <h4>Login to account</h4>
                    </div>
                )}
                {!isLoginMode && (
                    <div>
                        <h3>Welcome!</h3>
                        <h4>Create account</h4>
                    </div>
                )}
                <input
                    className='text-input'
                    id="email"
                    type="email"
                    placeholder="Email"
                    autoComplete={isLoginMode ? 'email' : 'email'}
                    {...register('emailRequired', { required: true, pattern: /^\S+@\S+\.\S+$/ })}
                />
                {errors.emailRequired && <p className='error'>A valid email is required</p>}
                <input
                    className='text-input'
                    type='password'
                    id="password"
                    placeholder="Password"
                    autoComplete={isLoginMode ? 'current-password' : 'new-password'}
                    {...register('passwordRequired', { required: true, minLength: 6 })}
                />
                {errors.passwordRequired && <p className='error'>Password must be at least 6 characters</p>}
                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? '...' : (isLoginMode ? 'Login' : 'Create')}
                </Button>
                <p className='auth-error-msg'>{errorMessage}</p>
                <div className='switch'>
                    {isLoginMode && (
                        <div>
                            <p>Don't have an account?</p>
                            <p onClick={switchModeHandler} className="switch-link">Create Account</p>
                            <p onClick={navJoin} className="switch-link">Join Code</p>
                        </div>
                    )}
                    {!isLoginMode && (
                        <div>
                            <p>Already have an account?</p>
                            <p onClick={switchModeHandler} className="switch-link">Login</p>
                        </div>
                    )}
                </div>
            </form>
        </div>
    );
};

export default Auth;
