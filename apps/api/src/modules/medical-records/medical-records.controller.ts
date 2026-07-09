import { Body, Controller, Get, Ip, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { MedicalRecordsService } from './medical-records.service';
import { CreateEntryDto } from './dto/create-entry.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('medical-records')
export class MedicalRecordsController {
  constructor(private records: MedicalRecordsService) {}

  @Get(':patientId')
  getRecord(
    @CurrentUser() user: AuthUser,
    @Param('patientId') patientId: string,
    @Ip() ip: string,
  ) {
    return this.records.getRecord(user, patientId, ip);
  }

  @Post('entries')
  @Roles('DOCTOR')
  addEntry(@CurrentUser() user: AuthUser, @Body() dto: CreateEntryDto, @Ip() ip: string) {
    return this.records.addEntry(user, dto, ip);
  }
}
