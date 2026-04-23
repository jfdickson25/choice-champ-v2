import React from 'react';
import './ToggleSwitch.css';

const ToggleSwitch = ({ checked, onChange, activeColor, ariaLabel, disabled }) => (
    <button
        type='button'
        role='switch'
        aria-checked={!!checked}
        aria-label={ariaLabel}
        disabled={disabled}
        className={`toggle-switch ${checked ? 'is-on' : ''}`}
        style={checked && activeColor ? { backgroundColor: activeColor } : undefined}
        onClick={() => onChange && onChange(!checked)}
    >
        <span className='toggle-switch-knob' />
    </button>
);

export default ToggleSwitch;
