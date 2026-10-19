# Data Schema Proposal

## Vehicle
- id
- externalId              # 車行來源唯一 ID
- source
- brand
- model
- trim
- year
- manufactureDate
- registrationDate
- mileageKm
- price
- originalPrice
- colorExterior
- colorInterior
- transmission
- displacementCc
- fuelType
- drivetrain
- seats
- plateStatus
- location
- status                  # available / pending / reserved / sold / hidden
- description
- inspectionProvider
- inspectionReportUrl
- accidentDisclosure      # unknown / disclosed / none-confirmed-by-source
- warrantyText
- financingText
- sourceUrl
- lastSyncedAt
- createdAt
- updatedAt

## VehicleImage
- id
- vehicleId
- externalImageId
- sourceUrl
- storedUrl
- position
- type                     # cover / exterior / interior / dashboard / detail / other
- altText
- hash                     # optional dedupe
- lastSyncedAt

## Lead
- id
- displayName
- contactChannel
- contactHandle
- sourcePlatform
- sourceGroup
- budgetMin
- budgetMax
- intendedUse
- preferredBrands
- preferredModels
- preferredYearMin
- maxMileageKm
- paymentPreference
- targetPurchaseDate
- stage
- notes
- assignedTo
- createdAt
- updatedAt

## LeadActivity
- id
- leadId
- type                     # message / call / note / appointment / referral / status_change
- content
- occurredAt
- createdBy

## AdDraft
- id
- vehicleId
- platform                 # facebook_group / facebook_profile / threads
- style                    # concise / informative / conversational
- headline
- body
- hashtags
- status                   # draft / review / approved / scheduled / published / rejected
- generatedBy
- generationInputSnapshot
- approvedBy
- approvedAt
- createdAt
- updatedAt

## AdPublication
- id
- adDraftId
- destinationType
- destinationId
- destinationName
- scheduledAt
- publishedAt
- externalPostId
- externalPostUrl
- status
- errorMessage

## Referral
- id
- leadId
- vehicleId
- partnerDealer
- partnerRep
- referredAt
- appointmentAt
- status
- dealAmount
- expectedCommission
- confirmedCommission
- commissionPaidAt
- notes

## PerformanceSnapshot
- id
- adPublicationId
- capturedAt
- impressions
- views
- reactions
- comments
- shares
- inquiries
- appointments
- conversions

## Integration
- id
- type                     # inventory_source / meta / threads / ai / image_storage
- provider
- status
- lastSyncAt
- metadata                 # NON-secret settings only

Secrets must be stored server-side in environment variables or a secrets manager.
