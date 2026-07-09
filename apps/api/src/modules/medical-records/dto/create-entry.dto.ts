import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateEntryDto {
  @IsUUID()
  patientId: string;

  @IsString()
  title: string;

  @IsString()
  content: string;

  @IsOptional()
  @IsUUID()
  appointmentId?: string;

  /** Si esta entrada corrige a una anterior (enmienda) */
  @IsOptional()
  @IsUUID()
  amendsEntryId?: string;
}
