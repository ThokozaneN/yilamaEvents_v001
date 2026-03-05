import { VenueZone, VenueSeat, SeatStatus } from '../types';

/**
 * Calculates the dynamic price of a seat based on base price, zone multiplier, and positional modifier.
 */
export function calculateDynamicSeatPrice(basePrice: number, zone: VenueZone, seat: VenueSeat): number {
    if (!zone || !seat) return basePrice;
    return parseFloat((basePrice * (zone.price_multiplier || 1) * (seat.positional_modifier || 1)).toFixed(2));
}

export interface GeneratedLayout {
    zones: Partial<VenueZone>[];
    sections?: any[]; // Array of sections for Mode B / Phase 2 hierarchy
    seats: Partial<VenueSeat>[];
    svgWidth: number;
    svgHeight: number;
}

// Helper to convert polar coordinates to cartesian for drawing curved SVG sections
export function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
    var angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
    return {
        x: centerX + (radius * Math.cos(angleInRadians)),
        y: centerY + (radius * Math.sin(angleInRadians))
    };
}

// Generates an SVG path data string for a curved wedge (an arc with inner and outer radius)
export function describeArc(x: number, y: number, innerRadius: number, outerRadius: number, startAngle: number, endAngle: number) {
    var startOuter = polarToCartesian(x, y, outerRadius, endAngle);
    var endOuter = polarToCartesian(x, y, outerRadius, startAngle);
    var startInner = polarToCartesian(x, y, innerRadius, endAngle);
    var endInner = polarToCartesian(x, y, innerRadius, startAngle);

    var largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

    var d = [
        "M", startOuter.x, startOuter.y,
        "A", outerRadius, outerRadius, 0, largeArcFlag, 0, endOuter.x, endOuter.y,
        "L", endInner.x, endInner.y,
        "A", innerRadius, innerRadius, 0, largeArcFlag, 1, startInner.x, startInner.y,
        "Z"
    ].join(" ");

    return d;
}

/**
 * Generates a generic block of seats (A rectangle).
 */
function generateBlock(
    startX: number, startY: number,
    rows: number, seatsPerRow: number,
    seatSpacing: number = 30, rowSpacing: number = 30,
    zoneId: string, rowPrefix: string, baseIndex: number = 1
): Partial<VenueSeat>[] {
    const seats: Partial<VenueSeat>[] = [];

    for (let r = 0; r < rows; r++) {
        const rowIdent = `${rowPrefix}${r + 1}`;
        // Positional modifier decay: front rows are 1.2, middle 1.0, back 0.9
        let modifier = 1.0;
        if (r < Math.ceil(rows * 0.2)) modifier = 1.2;
        else if (r > Math.floor(rows * 0.7)) modifier = 0.9;

        for (let s = 0; s < seatsPerRow; s++) {
            // Further modifier: center seats are slightly more premium
            const centerDist = Math.abs((seatsPerRow / 2) - s) / (seatsPerRow / 2);
            let seatModifier = modifier;
            if (centerDist < 0.3) seatModifier += 0.1; // Center bump
            else if (centerDist > 0.8) seatModifier -= 0.05; // Edge penalty

            seats.push({
                id: `seat-${zoneId}-${r}-${s}`,
                zone_id: zoneId,
                row_identifier: rowIdent,
                seat_identifier: `${baseIndex + s}`,
                svg_cx: startX + (s * seatSpacing),
                svg_cy: startY + (r * rowSpacing),
                positional_modifier: parseFloat(seatModifier.toFixed(2)),
                status: 'available' as SeatStatus,
            });
        }
    }
    return seats;
}

/**
 * Generates an Arena Layout Template (Center Stage surrounded by blocks)
 * Capacity defaults to roughly 1000 if not specified
 */
export function generateArenaTemplate(targetCapacity: number = 1000): GeneratedLayout {
    const zones: Partial<VenueZone>[] = [
        { id: 'zone-vip', name: 'VIP Ringside', color_code: '#EAB308', price_multiplier: 3.0, capacity: Math.floor(targetCapacity * 0.1) },
        { id: 'zone-premium', name: 'Premium Lower', color_code: '#8B5CF6', price_multiplier: 1.5, capacity: Math.floor(targetCapacity * 0.3) },
        { id: 'zone-standard', name: 'General Stands', color_code: '#3B82F6', price_multiplier: 1.0, capacity: targetCapacity - Math.floor(targetCapacity * 0.4) }
    ];

    const allSeats: Partial<VenueSeat>[] = [];

    const svgWidth = 1000;
    const svgHeight = 800;
    const centerX = svgWidth / 2;
    const centerY = svgHeight / 2;

    // Ringside VIP (North, South)
    const vipSeatsPerRow = Math.min(20, Math.floor((zones[0]?.capacity || 0) / 2));
    const vipRows = Math.max(1, Math.floor(((zones[0]?.capacity || 0) / 2) / vipSeatsPerRow));

    // North VIP
    allSeats.push(...generateBlock(
        centerX - ((vipSeatsPerRow * 30) / 2),
        centerY - 150 - (vipRows * 30),
        vipRows, vipSeatsPerRow, 30, 30, 'zone-vip', 'VN'
    ));

    // South VIP
    allSeats.push(...generateBlock(
        centerX - ((vipSeatsPerRow * 30) / 2),
        centerY + 150,
        vipRows, vipSeatsPerRow, 30, 30, 'zone-vip', 'VS'
    ));

    // Calculate premium seats remaining and generate outer rings...
    // For brevity in this generator, we are placing standard blocks around.
    const standardSeatsPerRow = 30;
    const standardRows = Math.max(2, Math.floor(((zones[2]?.capacity || 0)) / standardSeatsPerRow));

    allSeats.push(...generateBlock(
        centerX - ((standardSeatsPerRow * 30) / 2),
        50, // Top
        Math.floor(standardRows / 2), standardSeatsPerRow, 30, 30, 'zone-standard', 'GN'
    ));

    allSeats.push(...generateBlock(
        centerX - ((standardSeatsPerRow * 30) / 2),
        svgHeight - (Math.ceil(standardRows / 2) * 30) - 50, // Bottom
        Math.ceil(standardRows / 2), standardSeatsPerRow, 30, 30, 'zone-standard', 'GS'
    ));

    return { zones, seats: allSeats, svgWidth, svgHeight };
}

/**
 * Generates a classic Theater/Church Layout (Straight rows facing a stage)
 */
export function generateTheaterTemplate(targetCapacity: number = 500): GeneratedLayout {
    const zones: Partial<VenueZone>[] = [
        { id: 'zone-front', name: 'Front Rows', color_code: '#EC4899', price_multiplier: 1.5, capacity: Math.floor(targetCapacity * 0.2) },
        { id: 'zone-middle', name: 'Middle Section', color_code: '#F59E0B', price_multiplier: 1.2, capacity: Math.floor(targetCapacity * 0.4) },
        { id: 'zone-balcony', name: 'Balcony / Rear', color_code: '#10B981', price_multiplier: 1.0, capacity: targetCapacity - Math.floor(targetCapacity * 0.6) }
    ];

    const seatsPerRow = 24;
    const allSeats: Partial<VenueSeat>[] = [];
    const svgWidth = 800;

    let currentY = 150; // Leave room for stage at Y=50
    const startX = (svgWidth - (seatsPerRow * 30)) / 2;

    // Front
    const frontRows = Math.ceil((zones[0]?.capacity || 0) / seatsPerRow);
    allSeats.push(...generateBlock(startX, currentY, frontRows, seatsPerRow, 30, 30, 'zone-front', 'A'));
    currentY += (frontRows * 30) + 50; // Gap

    // Middle
    const middleRows = Math.ceil((zones[1]?.capacity || 0) / seatsPerRow);
    allSeats.push(...generateBlock(startX, currentY, middleRows, seatsPerRow, 30, 30, 'zone-middle', 'B'));
    currentY += (middleRows * 30) + 50; // Gap

    // Rear
    const rearRows = Math.ceil((zones[2]?.capacity || 0) / seatsPerRow);
    allSeats.push(...generateBlock(startX, currentY, rearRows, seatsPerRow, 30, 30, 'zone-balcony', 'C'));

    const svgHeight = currentY + (rearRows * 30) + 50;

    return { zones, seats: allSeats, svgWidth, svgHeight };
}

/**
 * Generates an FNB-style Stadium Layout (Phase 2 Hierarchical Architecture)
 * Creates macroscopic curved Sections, and maps seats inside them using polar coordinates.
 */
export function generateStadiumTemplate(targetCapacity: number = 20000): GeneratedLayout {
    const zones: Partial<VenueZone>[] = [
        { id: 'zone-vip', name: 'Premium Lower', color_code: '#EAB308', price_multiplier: 3.0, capacity: Math.floor(targetCapacity * 0.1) },
        { id: 'zone-standard', name: 'General Stands', color_code: '#3B82F6', price_multiplier: 1.0, capacity: Math.floor(targetCapacity * 0.5) },
        { id: 'zone-nosebleeds', name: 'Upper Deck', color_code: '#10B981', price_multiplier: 0.6, capacity: targetCapacity - Math.floor(targetCapacity * 0.6) }
    ];

    const sections: any[] = [];
    const allSeats: Partial<VenueSeat>[] = [];
    
    const svgWidth = 1600;
    const svgHeight = 1200;
    const cx = svgWidth / 2;
    const cy = svgHeight / 2;

    // Rings definition: 0=Lower, 1=Middle, 2=Upper
    const rings = [
        { zoneIdx: 0, innerR: 250, outerR: 350, numSections: 12, rowsPerSection: 8 },
        { zoneIdx: 1, innerR: 380, outerR: 550, numSections: 20, rowsPerSection: 15 },
        { zoneIdx: 2, innerR: 580, outerR: 750, numSections: 24, rowsPerSection: 15 }
    ];

    let seatGlobalIndex = 1;

    rings.forEach((ring, ringIdx) => {
        const sweepAngle = 360 / ring.numSections;
        
        for (let s = 0; s < ring.numSections; s++) {
            const startAngle = s * sweepAngle;
            const endAngle = (s + 1) * sweepAngle;
            const gapAngle = 2; // visual gap between sections

            // 1. Generate Macroscopic Section Path
            const sectionId = `sect-${ringIdx}-${s}`;
            const pathData = describeArc(cx, cy, ring.innerR, ring.outerR, startAngle + gapAngle, endAngle - gapAngle);
            
            sections.push({
                id: sectionId,
                name: `Block ${ringIdx + 1}${s.toString().padStart(2, '0')}`,
                svg_path_data: pathData,
                zone_id: zones[ring.zoneIdx]?.id,
                capacity: ring.rowsPerSection * Math.floor(((endAngle-startAngle)/360) * (Math.PI * 2 * ring.innerR) / 20) // approx
            });

            // 2. Generate Microscopic Seats inside this Section 
            // We step outward from innerR to outerR (rows), and arc across the angles (seats)
            const rowSpacing = (ring.outerR - ring.innerR) / ring.rowsPerSection;
            
            for (let r = 0; r < ring.rowsPerSection; r++) {
                const currentRadius = ring.innerR + (r * rowSpacing) + (rowSpacing / 2); // Put seat in middle of row band
                const arcLength = (sweepAngle / 360) * (2 * Math.PI * currentRadius);
                const seatsThisRow = Math.max(1, Math.floor((arcLength - 20) / 25)); // 25px per seat + padding

                const angleStep = (sweepAngle - (gapAngle * 3)) / seatsThisRow;
                
                for (let si = 0; si < seatsThisRow; si++) {
                    const seatAngle = startAngle + (gapAngle * 1.5) + (si * angleStep);
                    const coords = polarToCartesian(cx, cy, currentRadius, seatAngle);
                    
                    allSeats.push({
                        id: `seat-${sectionId}-${r}-${si}`,
                        section_id: sectionId, // Link hierarchy!
                        zone_id: zones[ring.zoneIdx]?.id,
                        row_identifier: String.fromCharCode(65 + r), // A, B, C...
                        seat_identifier: `${si + 1}`,
                        svg_cx: coords.x,
                        svg_cy: coords.y,
                        positional_modifier: r < 3 ? 1.2 : 1.0, // Front VIP bump
                        status: 'available'
                    });
                    
                    seatGlobalIndex++;
                }
            }
        }
    });

    return { zones, sections, seats: allSeats, svgWidth, svgHeight };
}

/**
 * Parses an SVG string and generates a layout based on circle and rect elements.
 */
export function parseSVGLayout(svgString: string, targetCapacity: number = 500): GeneratedLayout {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, "image/svg+xml");

    const zones: Partial<VenueZone>[] = [
        { id: 'zone-custom-1', name: 'General', color_code: '#8B5CF6', price_multiplier: 1.0, capacity: targetCapacity }
    ];

    const allSeats: Partial<VenueSeat>[] = [];
    const elements = doc.querySelectorAll('circle, rect');

    let svgWidth = 800;
    let svgHeight = 600;

    const svgEl = doc.querySelector('svg');
    if (svgEl) {
        if (svgEl.getAttribute('viewBox')) {
            const vb = svgEl.getAttribute('viewBox')?.split(' ').map(Number);
            if (vb && vb.length === 4) {
                svgWidth = vb[2] || 800;
                svgHeight = vb[3] || 600;
            }
        } else {
            svgWidth = Number(svgEl.getAttribute('width')) || 800;
            svgHeight = Number(svgEl.getAttribute('height')) || 600;
        }
    }

    let seatIndex = 1;

    elements.forEach(node => {
        if (seatIndex > targetCapacity) return;
        let cx = 0;
        let cy = 0;

        if (node.tagName === 'circle') {
            cx = Number(node.getAttribute('cx') || 0);
            cy = Number(node.getAttribute('cy') || 0);
        } else if (node.tagName === 'rect') {
            const x = Number(node.getAttribute('x') || 0);
            const y = Number(node.getAttribute('y') || 0);
            const w = Number(node.getAttribute('width') || 0);
            const h = Number(node.getAttribute('height') || 0);
            cx = x + w / 2;
            cy = y + h / 2;
        }

        allSeats.push({
            id: `seat-custom-${seatIndex}`,
            zone_id: 'zone-custom-1',
            row_identifier: 'C',
            seat_identifier: `${seatIndex}`,
            svg_cx: cx,
            svg_cy: cy,
            positional_modifier: 1.0,
            status: 'available'
        });
        seatIndex++;
    });

    return { zones, seats: allSeats, svgWidth, svgHeight };
}
