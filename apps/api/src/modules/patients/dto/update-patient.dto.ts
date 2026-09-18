import { IsDateString, IsNotEmpty, IsString, Matches, ValidateIf } from 'class-validator';

/** Only editable patient scalars. Omitted fields are preserved; null is rejected. */
export class UpdatePatientDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  firstName?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  lastName?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  documentId?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  birthDate?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  healthInsurance?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  insuranceNumber?: string;
}
