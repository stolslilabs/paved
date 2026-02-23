export class Tournament {
    id;
    prize;
    top1_player_id;
    top2_player_id;
    top3_player_id;
    top1_score;
    top2_score;
    top3_score;
    top1_claimed;
    top2_claimed;
    top3_claimed;
    constructor(tournament) {
        this.id = tournament.id;
        this.prize = tournament.prize.toString();
        this.top1_player_id = `0x${BigInt(tournament.top1_player_id).toString(16)}`;
        this.top2_player_id = `0x${BigInt(tournament.top2_player_id).toString(16)}`;
        this.top3_player_id = `0x${BigInt(tournament.top3_player_id).toString(16)}`;
        this.top1_score = tournament.top1_score;
        this.top2_score = tournament.top2_score;
        this.top3_score = tournament.top3_score;
        this.top1_claimed = tournament.top1_claimed;
        this.top2_claimed = tournament.top2_claimed;
        this.top3_claimed = tournament.top3_claimed;
    }
    static computeId(duration) {
        const now = new Date();
        return Math.floor(Math.floor(now.getTime() / 1000) / duration);
    }
    reward(rank) {
        if (rank === 1) {
            const second = this.reward(2);
            const third = this.reward(3);
            return Number(this.prize) - second - third;
        }
        if (rank === 2) {
            if (!Number(this.top2_player_id)) {
                return 0;
            }
            const third = this.reward(3);
            return (Number(this.prize) - third) / 3;
        }
        if (rank === 3) {
            if (!Number(this.top3_player_id)) {
                return 0;
            }
            return Number(this.prize) / 6;
        }
        return 0;
    }
    isClaimed(rank) {
        if (rank === 1) {
            return this.top1_claimed;
        }
        if (rank === 2) {
            return this.top2_claimed;
        }
        if (rank === 3) {
            return this.top3_claimed;
        }
        return false;
    }
    isOver(mode) {
        const duration = mode.duration();
        const id = Tournament.computeId(duration);
        return id > this.id;
    }
    isCurrent(mode) {
        const duration = mode.duration();
        const id = Tournament.computeId(duration);
        return id === this.id;
    }
    isClaimable(rank, mode) {
        return rank <= 3 && this.isOver(mode) && !this.isClaimed(rank);
    }
}
//# sourceMappingURL=tournament.js.map