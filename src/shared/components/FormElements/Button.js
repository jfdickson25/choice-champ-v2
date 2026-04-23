import React, { useState } from 'react';

import './Button.css';

const Button = props => {
    const [bounce, setBounce] = useState(false);

    const action = () => {
        if (props.onClick) {
            setBounce(true);
            setTimeout(() => {
                setBounce(false);
                props.onClick();
            }, 1000);
        }
    };

    const style = {};
    if (props.backgroundColor) style.backgroundColor = props.backgroundColor;
    if (props.color) style.color = props.color;
    if (bounce) {
        style.animation = 'button-press .75s';
        if (!props.backgroundColor) style.backgroundColor = '#dd9b14';
    }

    return (
        <button
            type={props.type}
            disabled={props.disabled}
            onClick={bounce ? undefined : action}
            className={`primary-btn ${props.className || ''}`.trim()}
            style={style}
        >
            {props.children}
        </button>
    );
};

export default Button;
