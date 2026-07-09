import { Module } from '@nestjs/common';
import { CalendarController } from './calendar.controller';
import { CalendarSyncService } from './calendar-sync.service';
import { IcsService } from './ics.service';
import { CryptoService } from '../../common/services/crypto.service';

@Module({
  controllers: [CalendarController],
  providers: [CalendarSyncService, IcsService, CryptoService],
  exports: [CalendarSyncService],
})
export class CalendarModule {}
