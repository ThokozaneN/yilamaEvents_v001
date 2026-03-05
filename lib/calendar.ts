/**
 * Utility for generating standard .ics Calendar files client-side.
 */

interface CalendarEvent {
    title: string;
    description: string;
    location: string;
    startTime: string; // ISO 8601 string or Date object
    endTime: string;   // ISO 8601 string or Date object
    url?: string;
}

const formatDateToICS = (dateObj: string | Date): string => {
    const d = new Date(dateObj);
    // Format: YYYYMMDDTHHMMSSZ
    return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
};

export const generateICS = (event: CalendarEvent): string => {
    const dtstart = formatDateToICS(event.startTime);
    const dtend = formatDateToICS(event.endTime);
    const dtstamp = formatDateToICS(new Date());

    const icsContent = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Yilama Events//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        `UID:${Math.random().toString(36).substr(2, 9)}@yilama.app`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART:${dtstart}`,
        `DTEND:${dtend}`,
        `SUMMARY:${event.title}`,
        `DESCRIPTION:${event.description.replace(/\n/g, '\\n')}`,
        `LOCATION:${event.location}`,
        event.url ? `URL:${event.url}` : '',
        'END:VEVENT',
        'END:VCALENDAR'
    ].filter(Boolean).join('\r\n');

    return icsContent;
};

export const downloadICS = (event: CalendarEvent, filename: string = 'event.ics') => {
    const icsStr = generateICS(event);
    const blob = new Blob([icsStr], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
