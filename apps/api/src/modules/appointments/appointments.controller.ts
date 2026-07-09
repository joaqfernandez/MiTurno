import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { AppointmentsService } from './appointments.service';
import { AvailabilityService } from './availability.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';

@Controller('appointments')
export class AppointmentsController {
  constructor(
    private appointments: AppointmentsService,
    private availability: AvailabilityService,
  ) {}

  /** Slots disponibles de un médico (público: el paciente elige antes de loguearse). */
  @Get('availability/:doctorId')
  getAvailability(
    @Param('doctorId') doctorId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.availability.getAvailableSlots(doctorId, new Date(from), new Date(to));
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  book(@CurrentUser() user: AuthUser, @Body() dto: CreateAppointmentDto) {
    return this.appointments.book(user, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  myAgenda(
    @CurrentUser() user: AuthUser,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.appointments.myAgenda(user, new Date(from), new Date(to));
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ) {
    return this.appointments.cancel(user, id, reason);
  }
}
