import { Module } from '@nestjs/common';
import { CourseModule } from '../course/course.module';
import { NotificationModule } from '../notification/notification.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { CertificateAdminController } from './certificate-admin.controller';
import { CertificateRequestService } from './certificate-request.service';
import { CertificateController } from './certificate.controller';
import { CertificateService } from './certificate.service';

@Module({
  imports: [CourseModule, NotificationModule, ProfilesModule],
  controllers: [CertificateController, CertificateAdminController],
  providers: [CertificateService, CertificateRequestService],
  exports: [CertificateService],
})
export class CertificateModule {}
