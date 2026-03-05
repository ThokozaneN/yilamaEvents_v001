import React from 'react';
import {
    Music,
    Moon,
    Trophy,
    Theater,
    Utensils,
    Users,
    Cpu,
    ShoppingBag,
    Sparkles,
    Briefcase,
    MapPin
} from 'lucide-react';

interface CategoryIconProps {
    name: string;
    className?: string;
}

const iconMap: Record<string, React.ElementType> = {
    'music': Music,
    'moon': Moon,
    'trophy': Trophy,
    'theater': Theater,
    'utensils': Utensils,
    'users': Users,
    'cpu': Cpu,
    'shopping-bag': ShoppingBag,
    'sparkles': Sparkles,
    'briefcase': Briefcase,
};

export const CategoryIcon: React.FC<CategoryIconProps> = ({ name, className }) => {
    const IconComponent = iconMap[name.toLowerCase()] || MapPin;
    return <IconComponent className={className} size={16} />;
};
