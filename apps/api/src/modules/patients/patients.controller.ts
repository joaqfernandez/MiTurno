import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { PatientsService } from './patients.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('patients')
export class PatientsController {
  constructor(private patients: PatientsService) {}

  @Get('me')
  getMe(@CurrentUser() user: AuthUser) {
    return this.patients.getMe(user);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: AuthUser, @Body() body: any) {
    return this.patients.updateMe(user, body);
  }

  /** Panel del médico: historial de pacientes atendidos. */
  @Get('of-my-practice')
  @Roles('DOCTOR')
  ofMyPractice(@CurrentUser() user: AuthUser) {
    return this.patients.patientsOfDoctor(user);
  }
}
