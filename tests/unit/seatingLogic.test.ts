import { describe, it, expect } from 'vitest';
import {
    calculateDynamicSeatPrice,
    polarToCartesian,
    describeArc,
    generateArenaTemplate,
    generateTheaterTemplate,
    generateStadiumTemplate,
} from '../../lib/seatingLogic';
import type { VenueZone, VenueSeat } from '../../types';

// ─── calculateDynamicSeatPrice ────────────────────────────────────────────────
describe('calculateDynamicSeatPrice', () => {
    const zone: Partial<VenueZone> = { price_multiplier: 2.0 };
    const seat: Partial<VenueSeat> = { positional_modifier: 1.2 };

    it('applies zone and positional multipliers correctly', () => {
        // 100 * 2.0 * 1.2 = 240.00
        expect(calculateDynamicSeatPrice(100, zone as VenueZone, seat as VenueSeat)).toBeCloseTo(240.0);
    });

    it('returns base price when zone is missing', () => {
        expect(calculateDynamicSeatPrice(100, null as any, seat as VenueSeat)).toBe(100);
    });

    it('returns base price when seat is missing', () => {
        expect(calculateDynamicSeatPrice(100, zone as VenueZone, null as any)).toBe(100);
    });

    it('defaults multiplier of 1 when zone has no price_multiplier', () => {
        const noMultZone = {} as VenueZone;
        const noModSeat = {} as VenueSeat;
        expect(calculateDynamicSeatPrice(150, noMultZone, noModSeat)).toBe(150);
    });

    it('rounds to 2 decimal places', () => {
        const z = { price_multiplier: 1.333 } as VenueZone;
        const s = { positional_modifier: 1.0 } as VenueSeat;
        const result = calculateDynamicSeatPrice(100, z, s);
        // 100 * 1.333 * 1 = 133.30
        expect(result).toBe(parseFloat((100 * 1.333).toFixed(2)));
    });
});

// ─── polarToCartesian ─────────────────────────────────────────────────────────
describe('polarToCartesian', () => {
    it('maps 0° to the top of the circle (y - r)', () => {
        // angle=0 => angleInRadians = -π/2 => cos=0, sin=-1
        const pt = polarToCartesian(500, 500, 100, 0);
        expect(pt.x).toBeCloseTo(500, 5);
        expect(pt.y).toBeCloseTo(400, 5); // 500 - 100
    });

    it('maps 90° to the right of centre (x + r)', () => {
        const pt = polarToCartesian(500, 500, 100, 90);
        expect(pt.x).toBeCloseTo(600, 5);
        expect(pt.y).toBeCloseTo(500, 5);
    });

    it('maps 180° to the bottom of the circle (y + r)', () => {
        const pt = polarToCartesian(500, 500, 100, 180);
        expect(pt.x).toBeCloseTo(500, 5);
        expect(pt.y).toBeCloseTo(600, 5);
    });
});

// ─── describeArc ──────────────────────────────────────────────────────────────
describe('describeArc', () => {
    it('returns a non-empty SVG path string', () => {
        const d = describeArc(500, 500, 100, 200, 0, 90);
        expect(typeof d).toBe('string');
        expect(d.length).toBeGreaterThan(0);
        expect(d).toContain('M');
        expect(d).toContain('A');
        expect(d).toContain('Z');
    });

    it('uses the large-arc flag for arcs > 180°', () => {
        const big = describeArc(500, 500, 100, 200, 0, 270);
        expect(big).toContain('1');
    });

    it('uses the small-arc flag for arcs ≤ 180°', () => {
        const small = describeArc(500, 500, 100, 200, 0, 90);
        // flag should be "0" for <=180
        expect(small).toMatch(/A \d+ \d+ 0 0/);
    });
});

// ─── generateArenaTemplate ────────────────────────────────────────────────────
describe('generateArenaTemplate', () => {
    it('returns zones and seats with correct SVG dimensions', () => {
        const layout = generateArenaTemplate(500);
        expect(layout.svgWidth).toBe(1000);
        expect(layout.svgHeight).toBe(800);
        expect(layout.zones.length).toBeGreaterThan(0);
        expect(layout.seats.length).toBeGreaterThan(0);
    });

    it('all seats belong to a valid zone', () => {
        const layout = generateArenaTemplate(500);
        const validZoneIds = new Set(layout.zones.map(z => z.id));
        layout.seats.forEach(seat => {
            expect(validZoneIds.has(seat.zone_id!)).toBe(true);
        });
    });

    it('default capacity of 1000 produces seats', () => {
        const layout = generateArenaTemplate();
        expect(layout.seats.length).toBeGreaterThan(0);
    });
});

// ─── generateTheaterTemplate ──────────────────────────────────────────────────
describe('generateTheaterTemplate', () => {
    it('returns 3 zones', () => {
        const layout = generateTheaterTemplate(300);
        expect(layout.zones.length).toBe(3);
    });

    it('all seats have an available status', () => {
        const layout = generateTheaterTemplate(200);
        layout.seats.forEach(seat => {
            expect(seat.status).toBe('available');
        });
    });

    it('produces a sensible SVG height > 200', () => {
        const layout = generateTheaterTemplate(200);
        expect(layout.svgHeight).toBeGreaterThan(200);
    });
});

// ─── generateStadiumTemplate ──────────────────────────────────────────────────
describe('generateStadiumTemplate', () => {
    it('returns zones, sections, and seats', () => {
        const layout = generateStadiumTemplate(5000);
        expect(layout.zones.length).toBe(3);
        expect(layout.sections!.length).toBeGreaterThan(0);
        expect(layout.seats.length).toBeGreaterThan(0);
    });

    it('seats reference a valid section_id', () => {
        const layout = generateStadiumTemplate(5000);
        const sectionIds = new Set(layout.sections!.map((s: any) => s.id));
        layout.seats.forEach(seat => {
            if (seat.section_id) {
                expect(sectionIds.has(seat.section_id)).toBe(true);
            }
        });
    });

    it('seats have positional_modifier ≥ 0.6 and ≤ 1.2', () => {
        const layout = generateStadiumTemplate(5000);
        layout.seats.forEach(seat => {
            expect(seat.positional_modifier!).toBeGreaterThanOrEqual(0.6);
            expect(seat.positional_modifier!).toBeLessThanOrEqual(1.2);
        });
    });
});
