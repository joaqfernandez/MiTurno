import { Body, Controller, Get, Param, Patch, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { DoctorsService } from './doctors.service';

@Controller('doctors')
export class DoctorsController {
  constructor(private doctors: DoctorsService) {}

  @Get()
  search(@Query('specialty') specialty?: string, @Query('q') q?: string) {
    return this.doctors.search(specialty, q);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DOCTOR')
  @Patch(':id/settings')
  updateSettings(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: any) {
    return this.doctors.updateSettings(user, id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DOCTOR')
  @Put(':id/schedule')
  setSchedule(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body('schedules') schedules: any[]) {
    return this.doctors.setSchedule(user, id, schedules);
  }
}
