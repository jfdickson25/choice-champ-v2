import React from 'react';
import { Menu } from '@mui/material';
import { Check } from 'lucide-react';

import './SortFilterPanel.css';

const SortFilterPanel = ({
    anchorEl,
    open,
    onClose,
    sortOptions = [],
    sortValue,
    onSortChange,
    sortLabel = 'Sort',
    filterOptions = [],
    filterValue,
    onFilterChange,
    filterLabel = 'Filter',
    viewOptions = [],
    viewValue,
    onViewChange,
    viewLabel = 'View',
    activeColor = '#FCB016',
}) => {
    return (
        <Menu
            anchorEl={anchorEl}
            open={open}
            onClose={onClose}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            PaperProps={{ className: 'sort-filter-panel-paper' }}
        >
            <div className='sort-filter-panel'>
                {sortOptions.length > 0 && (
                    <div className='sort-filter-column'>
                        <div className='sort-filter-header'>{sortLabel}</div>
                        {sortOptions.map(opt => (
                            <OptionRow
                                key={opt.value}
                                option={opt}
                                active={sortValue === opt.value}
                                onClick={() => onSortChange(opt.value)}
                                activeColor={activeColor}
                            />
                        ))}
                    </div>
                )}
                {filterOptions.length > 0 && (
                    <div className='sort-filter-column'>
                        <div className='sort-filter-header'>{filterLabel}</div>
                        {filterOptions.map(opt => (
                            <OptionRow
                                key={opt.value}
                                option={opt}
                                active={filterValue === opt.value}
                                onClick={() => onFilterChange(opt.value)}
                                activeColor={activeColor}
                            />
                        ))}
                    </div>
                )}
                {viewOptions.length > 0 && (
                    <div className='sort-filter-column'>
                        <div className='sort-filter-header'>{viewLabel}</div>
                        {viewOptions.map(opt => (
                            <OptionRow
                                key={opt.value}
                                option={opt}
                                active={viewValue === opt.value}
                                onClick={() => onViewChange(opt.value)}
                                activeColor={activeColor}
                            />
                        ))}
                    </div>
                )}
            </div>
        </Menu>
    );
};

const OptionRow = ({ option, active, onClick, activeColor }) => {
    const Icon = option.icon;
    return (
        <button
            className={`sort-filter-option ${active ? 'sort-filter-option-active' : ''}`}
            onClick={onClick}
            style={active ? { color: activeColor } : undefined}
        >
            {Icon && <Icon size={16} strokeWidth={2} />}
            <span className='sort-filter-option-label'>{option.label}</span>
            {active && <Check size={16} strokeWidth={2.5} className='sort-filter-option-check' />}
        </button>
    );
};

export default SortFilterPanel;
