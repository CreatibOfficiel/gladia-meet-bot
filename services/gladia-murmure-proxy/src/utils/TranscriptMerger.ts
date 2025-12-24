
export class TranscriptMerger {
    private fullTranscript: string = "";

    constructor() {}

    /**
     * Merge a new segment into the accumulated transcript.
     * Tries to find overlap between the end of the existing transcript and the start of the new segment.
     */
    merge(newSegment: string): string {
        const cleanedSegment = newSegment.trim();
        if (!cleanedSegment) return this.fullTranscript;

        if (!this.fullTranscript) {
            this.fullTranscript = cleanedSegment;
            return this.fullTranscript;
        }

        // Simple overlap detection (suffix of old matches prefix of new)
        // We check from the largest possible overlap down to a minimum threshold
        const overlap = this.findOverlap(this.fullTranscript, cleanedSegment);
        
        if (overlap > 0) {
            // Append only the non-overlapping part
            const newPart = cleanedSegment.substring(overlap).trim();
            if (newPart) {
                this.fullTranscript += " " + newPart;
            }
        } else {
            // No overlap found, just append
            this.fullTranscript += " " + cleanedSegment;
        }

        return this.fullTranscript;
    }

    private findOverlap(a: string, b: string): number {
        // Normalize for comparison (lowercase, remove punctuation if needed - keeping simple for now)
        const wa = a.toLowerCase();
        const wb = b.toLowerCase();

        // Heuristic: check last N words of A against B
        // This is a naive implementation, O(N^2) worst case but acceptable for short segments
        
        const minOverlap = 3; // Minimum characters to consider an overlap
        const maxCheck = Math.min(wa.length, wb.length);

        for (let len = maxCheck; len >= minOverlap; len--) {
            const suffixA = wa.substring(wa.length - len);
            const prefixB = wb.substring(0, len);
            
            if (suffixA === prefixB) {
                // Verify original case (optional, depending on strictness)
                return len;
            }
        }
        return 0;
    }

    reset() {
        this.fullTranscript = "";
    }
}
