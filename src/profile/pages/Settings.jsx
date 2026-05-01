import React, { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Dialog } from '@mui/material';

import { AuthContext } from '../../shared/context/auth-context';
import { ThemeContext } from '../../shared/context/theme-context';
import { api } from '../../shared/lib/api';
import { supabase } from '../../shared/lib/supabase';
import SegmentedToggle from '../../shared/components/SegmentedToggle/SegmentedToggle';

import './Settings.css';

const THEME_OPTIONS = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
];

const Settings = () => {
    const auth = useContext(AuthContext);
    const { theme, setTheme } = useContext(ThemeContext);
    const navigate = useNavigate();

    const [usernameInput, setUsernameInput] = useState(auth.username || '');
    const [usernameStatus, setUsernameStatus] = useState({ kind: 'idle', message: '' });

    const [currentPwd, setCurrentPwd] = useState('');
    const [newPwd, setNewPwd] = useState('');
    const [confirmPwd, setConfirmPwd] = useState('');
    const [pwdStatus, setPwdStatus] = useState({ kind: 'idle', message: '' });

    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState('');

    useEffect(() => {
        auth.showFooterHandler(false);
        return () => auth.showFooterHandler(true);
    }, [auth]);

    // Keep input synced if username updates elsewhere (e.g., refreshProfile).
    useEffect(() => {
        setUsernameInput(auth.username || '');
    }, [auth.username]);

    const saveUsername = async () => {
        const trimmed = usernameInput.trim();
        if (!trimmed) {
            setUsernameStatus({ kind: 'error', message: 'Username is required' });
            return;
        }
        if (trimmed === auth.username) {
            setUsernameStatus({ kind: 'error', message: 'Same as current username' });
            return;
        }
        setUsernameStatus({ kind: 'saving', message: 'Saving…' });
        try {
            await api('/user/username', {
                method: 'POST',
                body: JSON.stringify({ username: trimmed }),
            });
            await auth.refreshProfile?.();
            setUsernameStatus({ kind: 'success', message: 'Username updated' });
        } catch (err) {
            setUsernameStatus({ kind: 'error', message: err.message || 'Could not update username' });
        }
    };

    const updatePassword = async () => {
        if (!currentPwd) {
            setPwdStatus({ kind: 'error', message: 'Current password is required' });
            return;
        }
        if (newPwd.length < 6) {
            setPwdStatus({ kind: 'error', message: 'New password must be at least 6 characters' });
            return;
        }
        if (newPwd !== confirmPwd) {
            setPwdStatus({ kind: 'error', message: 'New passwords don’t match' });
            return;
        }
        setPwdStatus({ kind: 'saving', message: 'Saving…' });

        // Re-auth check: Supabase's updateUser only requires a valid
        // session, so without this anyone with access to an unlocked
        // tab could change the password. Verify by trying to sign in
        // with the current password before mutating.
        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr || !userData?.user?.email) {
            setPwdStatus({ kind: 'error', message: 'Could not verify your session' });
            return;
        }
        const { error: signInError } = await supabase.auth.signInWithPassword({
            email: userData.user.email,
            password: currentPwd,
        });
        if (signInError) {
            setPwdStatus({ kind: 'error', message: 'Current password is incorrect' });
            return;
        }

        const { error } = await supabase.auth.updateUser({ password: newPwd });
        if (error) {
            setPwdStatus({ kind: 'error', message: error.message || 'Could not update password' });
            return;
        }
        setCurrentPwd('');
        setNewPwd('');
        setConfirmPwd('');
        setPwdStatus({ kind: 'success', message: 'Password updated' });
    };

    const closeDeleteDialog = () => {
        setDeleteOpen(false);
        setDeleteConfirm('');
    };

    const deleteAccount = () => {
        api('/user/me', { method: 'DELETE' })
            .then(() => auth.logout())
            .catch(err => console.log(err));
    };

    const canDelete = auth.username && deleteConfirm === auth.username;

    return (
        <React.Fragment>
            <div className='content settings-content'>
                <div className='settings-topbar'>
                    <button
                        type='button'
                        className='icon-btn'
                        onClick={() => navigate('/profile')}
                        aria-label='Back to profile'
                    >
                        <ArrowLeft size={22} strokeWidth={1.75} />
                    </button>
                </div>

                <h1 className='settings-title'>Settings</h1>

                <section className='settings-block'>
                    <h2 className='settings-block-title'>Appearance</h2>
                    <SegmentedToggle
                        options={THEME_OPTIONS}
                        value={theme}
                        onChange={setTheme}
                    />
                </section>

                <section className='settings-block'>
                    <h2 className='settings-block-title'>Username</h2>
                    <input
                        className='cc-dialog-input'
                        type='text'
                        autoComplete='off'
                        autoCapitalize='off'
                        autoCorrect='off'
                        spellCheck='false'
                        value={usernameInput}
                        onChange={(e) => {
                            setUsernameInput(e.target.value);
                            if (usernameStatus.kind !== 'idle') setUsernameStatus({ kind: 'idle', message: '' });
                        }}
                    />
                    <button
                        type='button'
                        className='settings-action-btn'
                        onClick={saveUsername}
                        disabled={usernameStatus.kind === 'saving'}
                    >
                        {usernameStatus.kind === 'saving' ? 'Saving…' : 'Save'}
                    </button>
                    {usernameStatus.message && (
                        <p className={`settings-status settings-status-${usernameStatus.kind}`}>
                            {usernameStatus.message}
                        </p>
                    )}
                </section>

                <section className='settings-block'>
                    <h2 className='settings-block-title'>Password</h2>
                    <input
                        className='cc-dialog-input'
                        type='password'
                        placeholder='Current password'
                        autoComplete='current-password'
                        value={currentPwd}
                        onChange={(e) => {
                            setCurrentPwd(e.target.value);
                            if (pwdStatus.kind !== 'idle') setPwdStatus({ kind: 'idle', message: '' });
                        }}
                    />
                    <input
                        className='cc-dialog-input'
                        type='password'
                        placeholder='New password'
                        autoComplete='new-password'
                        value={newPwd}
                        onChange={(e) => {
                            setNewPwd(e.target.value);
                            if (pwdStatus.kind !== 'idle') setPwdStatus({ kind: 'idle', message: '' });
                        }}
                    />
                    <input
                        className='cc-dialog-input'
                        type='password'
                        placeholder='Confirm new password'
                        autoComplete='new-password'
                        value={confirmPwd}
                        onChange={(e) => {
                            setConfirmPwd(e.target.value);
                            if (pwdStatus.kind !== 'idle') setPwdStatus({ kind: 'idle', message: '' });
                        }}
                    />
                    <button
                        type='button'
                        className='settings-action-btn'
                        onClick={updatePassword}
                        disabled={pwdStatus.kind === 'saving' || !currentPwd || !newPwd || !confirmPwd}
                    >
                        {pwdStatus.kind === 'saving' ? 'Saving…' : 'Update password'}
                    </button>
                    {pwdStatus.message && (
                        <p className={`settings-status settings-status-${pwdStatus.kind}`}>
                            {pwdStatus.message}
                        </p>
                    )}
                </section>

                <section className='settings-block settings-danger-block'>
                    <h2 className='settings-block-title'>Danger zone</h2>
                    <button
                        type='button'
                        className='settings-danger-link'
                        onClick={() => setDeleteOpen(true)}
                    >
                        Delete Account
                    </button>
                </section>
            </div>

            <Dialog
                open={deleteOpen}
                onClose={closeDeleteDialog}
                fullWidth
                maxWidth='xs'
                PaperProps={{ className: 'cc-dialog-paper' }}
            >
                <div className='cc-dialog'>
                    <h3 className='cc-dialog-title'>Delete account?</h3>
                    <p className='cc-dialog-subtitle'>
                        This permanently removes your account and any collections only you own. This can't be undone.
                    </p>
                    <input
                        className='cc-dialog-input'
                        type='text'
                        autoComplete='off'
                        autoCapitalize='off'
                        autoCorrect='off'
                        spellCheck='false'
                        value={deleteConfirm}
                        onChange={(e) => setDeleteConfirm(e.target.value)}
                        placeholder={auth.username || ''}
                    />
                    <p className='cc-dialog-hint'>Type <strong>{auth.username}</strong> to confirm.</p>
                    <div className='cc-dialog-actions'>
                        <button type='button' className='cc-dialog-btn cc-dialog-btn-secondary' onClick={closeDeleteDialog}>Cancel</button>
                        <button
                            type='button'
                            className='cc-dialog-btn cc-dialog-btn-danger'
                            onClick={deleteAccount}
                            disabled={!canDelete}
                        >
                            Delete
                        </button>
                    </div>
                </div>
            </Dialog>
        </React.Fragment>
    );
};

export default Settings;
