import { IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateAppointmentDto {
  @IsUUID()
  doctorId: string;

  @IsISO8601()
  startAt: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
