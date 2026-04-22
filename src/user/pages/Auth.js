import React, {useContext, useState} from 'react';
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";

import logo from '../../shared/assets/img/logo.png'
import Button from '../../shared/components/FormElements/Button';

import { AuthContext } from '../../shared/context/auth-context';

import './Auth.css';

const Auth = props => {
    // useContext is used to access the context object created in auth-context.js
    // with this we can access the isLoggedIn state and the login and logout functions
    const auth = useContext(AuthContext);
    const navigate = useNavigate();
    // State to change between login and create
    const [isLoginMode, setIsLoginMode] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');

    // Allow for validation of input
    const { register, handleSubmit, setValue, formState: { errors } } = useForm();

    const onSubmit = data => {
        let status; 

        // Either login or create account
        if(isLoginMode) {
            fetch('https://choice-champ-backend-181ffd005e9f.herokuapp.com/user/signIn', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username: data.usernameRequired,
                    password: data.passwordRequired
                })
            })
            .then(response => {
                status = response.status;
                return response.json()
            })
            .then(body => {
                if(status === 200) {
                    auth.login();
                    // Save user id to context so it can be used in other backend calls
                    auth.userIdSetter(body.userId);
                    // Set the userId to local storage so it can be used in other backend calls
                    localStorage.setItem('userId', body.userId);
                    navigate('/collections');
                } else {
                    setErrorMessage(body.errMsg);
                }
            })
            .catch(err => {
                console.log(err);
            });
        } else {
            fetch('https://choice-champ-backend-181ffd005e9f.herokuapp.com/user', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username: data.usernameRequired,
                    password: data.passwordRequired
                })
            })
            .then(response => {
                status = response.status;
                return response.json()
            })
            .then(body => {
                if(status === 200) {
                auth.login();
                auth.userIdSetter(body.userId);

                // Set the userId to local storage so it can be used in other backend calls
                localStorage.setItem('userId', body.userId);

                navigate('/welcome/info');
                } else {
                    setErrorMessage(body.errMsg);
                }
            })
            .catch(err => {
                console.log(err);
            });
        }
    }

    const switchModeHandler = () => {
        setIsLoginMode(prevMode => !prevMode);
        setErrorMessage('');
        setValue('usernameRequired', '');
        setValue('passwordRequired', '');

        // Clean useForm errors
        errors.usernameRequired = false;
        errors.passwordRequired = false;
    }

    const navJoin = () => {
        navigate('/party/joinParty');
    }

    return (
        <div className='center'>
            <form onSubmit={handleSubmit(onSubmit)}>
                
                <img src='/Logo/choice-champ-title.png' alt="Choice Champ Logo" id="logo" />
                
                <div className='seperator' />
                
                {
                    isLoginMode && (
                        <div>
                            <h3>Welcome Back</h3>
                            <h4>Login to account</h4>
                        </div>
                    )
                }
                {
                    !isLoginMode && (
                        <div>
                            <h3>Welcome!</h3>
                            <h4>Create account</h4>
                        </div>
                    )
                }
                <input id="username" placeholder="Username" {...register("usernameRequired", { required: true, minLength: 5, maxLength: 20 }) }/>
                {errors.usernameRequired && <p className='error'>A username of at least 5 characters is required</p>}
                <input type='password' id="password" placeholder="Password" {...register("passwordRequired", { required: true, minLength: 5 }) }/>
                {errors.passwordRequired && <p className='error'>A password of at lease 5 characters is required</p>}
                {
                    isLoginMode && (
                        <Button type="submit">Login</Button>
                    )
                }
                {
                    !isLoginMode && (
                        <Button type="submit">Create</Button>
                    )
                }
                <p className='auth-error-msg'>{errorMessage}</p>
                <div className='switch'>
                    { isLoginMode && (
                        <div>
                            <p>Don't have an account?</p>
                            <p onClick={switchModeHandler} className="switch-link">Create Account</p>
                            <p onClick={navJoin} className="switch-link">Join Code</p>
                        </div>
                    )}
                    { !isLoginMode && (
                    <div>
                        <p>Already have an account?</p>
                        <p onClick={switchModeHandler} className="switch-link">Login</p>
                    </div>
                    )}

                </div>
            </form>
        </div>
    );
}

export default Auth;