import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';

import Button from '../../shared/components/FormElements/Button';
import Loading from '../../shared/components/Loading';
import { supabase } from '../../shared/lib/supabase';

import './Auth.css';

// Users land here after clicking a recovery email from Supabase. supabase-js
// processes the URL hash on load and emits a PASSWORD_RECOVERY auth event, at
// which point we show the "new password" form. If the token is invalid or
// already consumed, show a clear error and send them back to login.
const PasswordReset = () => {
    const navigate = useNavigate();
    const [ready, setReady] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { register, handleSubmit, formState: { errors } } = useForm();

    useEffect(() => {
        let timer;
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setReady(true);
        });
        // Fallback: if the auth event already fired before we subscribed, check session directly.
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) setReady(true);
        });
        // Give it a moment — if still not ready, the link was probably invalid.
        timer = setTimeout(() => {
            if (!ready) {
                supabase.auth.getSession().then(({ data: { session } }) => {
                    if (!session) setErrorMessage('This reset link is invalid or has expired. Request a new one from the login page.');
                });
            }
        }, 3000);
        return () => { subscription.unsubscribe(); clearTimeout(timer); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const onSubmit = async (data) => {
        setErrorMessage('');
        setIsSubmitting(true);
        const { error } = await supabase.auth.updateUser({ password: data.passwordRequired });
        setIsSubmitting(false);
        if (error) { setErrorMessage(error.message); return; }
        setSuccessMessage('Password updated. Redirecting...');
        setTimeout(() => navigate('/collections/movie'), 1200);
    };

    return (
        <div className='center'>
            <form onSubmit={handleSubmit(onSubmit)}>
                <img src="/img/Logo/choice-champ-title.png" alt="Choice Champ Logo" id="logo" />
                <div className='seperator' />

                <div>
                    <h3>Set New Password</h3>
                    <h4>Enter a new password for your account</h4>
                </div>

                {!ready && !errorMessage && (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '30px 0' }}>
                        <Loading color='#FCB016' type='beat' size={14} speed={0.5} />
                    </div>
                )}

                {ready && (
                    <>
                        <input
                            className='text-input'
                            type='password'
                            placeholder="New password"
                            autoComplete='new-password'
                            {...register('passwordRequired', { required: true, minLength: 6 })}
                        />
                        {errors.passwordRequired && <p className='error'>Password must be at least 6 characters</p>}
                        <Button type='submit' disabled={isSubmitting}>
                            {isSubmitting ? '...' : 'Update Password'}
                        </Button>
                    </>
                )}

                {errorMessage && <p className='auth-error-msg'>{errorMessage}</p>}
                {successMessage && <p className='auth-error-msg' style={{ color: '#45B859' }}>{successMessage}</p>}

                {errorMessage && (
                    <div className='switch'>
                        <p onClick={() => navigate('/')} className="switch-link">Back to Login</p>
                    </div>
                )}
            </form>
        </div>
    );
};

export default PasswordReset;
