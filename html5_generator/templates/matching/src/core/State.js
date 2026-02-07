export class GameState {
  constructor(config, bus) {
    this.config = config;
    this.bus = bus;
    this.reset();
  }

  reset() {
    this.balance = this.config.game.initialBalance;
    this.stepIndex = 0;
    this.isComplete = false;
    this.bus.emit('balance:changed', this.balance);
    this.bus.emit('progress:changed', 0);
  }

  placeBill(bill, zoneId) {
    if (this.isComplete) return { status: 'complete' };
    if (zoneId !== bill.zoneId) {
      this.bus.emit('drop:invalid', {
        wrongZoneId: zoneId,
        correctZoneId: bill.zoneId
      });
      return { status: 'wrong' };
    }

    const reward = this.config.game.rewards[this.stepIndex] ?? 2;
    this.stepIndex += 1;
    this.balance = Math.min(this.balance + reward, this.config.game.targetBalance);

    this.bus.emit('bill:placed', { billId: bill.id, zoneId, reward, balance: this.balance });
    this.bus.emit('balance:changed', this.balance);
    this.bus.emit('progress:changed', this.balance / this.config.game.targetBalance);

    if (this.balance >= this.config.game.targetBalance) {
      this.isComplete = true;
      this.bus.emit('game:won');
    }

    return { status: 'ok', reward };
  }
}
