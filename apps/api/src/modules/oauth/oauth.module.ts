import { Module } from '@nestjs/common';
import { OAuthStateService } from './oauth-state.service';

@Module({ providers: [OAuthStateService], exports: [OAuthStateService] })
export class OAuthModule {}
