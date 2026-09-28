<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Model;

class Policy extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return ['is_published' => 'boolean'];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    /** @return list<array{slug:string,title:string,summary:string,content:string}> */
    public static function definitions(): array
    {
        return [
            [
                'slug' => 'terms-of-service',
                'title' => 'Terms of Service',
                'summary' => 'The rules and conditions for using the Procurement Sys platform.',
                'content' => <<<'TEXT'
# 1. Purpose
These Terms of Service govern access to and use of Procurement Sys by authorized employees, administrators, suppliers and other approved users.

# 2. Authorized use
Users may use the platform only for legitimate business activities, including procurement, inventory, supplier coordination, document management and reporting. Each user is responsible for keeping account credentials confidential and for all activity performed through their account.

# 3. Data accuracy
Users must enter complete and accurate information and promptly correct errors. Transactions, approvals, stock movements and documents must reflect the underlying business activity.

# 4. Access and security
Access is controlled by role and organization. Users must not attempt to bypass permissions, access another organization’s information, share credentials, or upload malicious or unlawful content. Suspected security incidents must be reported to an administrator immediately.

# 5. Availability and records
The platform is provided for operational use and may be unavailable during maintenance or because of infrastructure or connectivity problems. Organizations remain responsible for retaining required business records and maintaining appropriate backups.

# 6. Changes and contact
An administrator may update these terms when the platform, business process or legal requirements change. Continued use after publication of an update constitutes acknowledgement of the revised terms.

This default policy is an operational template and should be reviewed by management and legal advisers before production use.
TEXT,
            ],
            [
                'slug' => 'privacy-policy',
                'title' => 'Privacy Policy',
                'summary' => 'How Procurement Sys collects, uses and protects account and operational information.',
                'content' => <<<'TEXT'
# 1. Information we process
Procurement Sys may process names, contact details, login and audit information, organization and role assignments, supplier and product records, procurement transactions, uploaded documents and system activity required to operate the service.

# 2. How information is used
Information is used to authenticate users, enforce permissions, process procurement and inventory workflows, generate reports and documents, provide notifications, maintain audit trails, prevent misuse and improve system reliability.

# 3. Sharing and access
Information is available only to authorized users within the relevant organization or to service providers supporting hosting, email and infrastructure operations. We do not grant users access to information beyond their assigned permissions.

# 4. Retention and security
Operational records are retained according to organizational and legal requirements. Access controls, audit records, secure transport and appropriate storage protections are used to reduce the risk of unauthorized access, alteration or loss.

# 5. User responsibilities
Users must keep credentials secure, avoid uploading unnecessary sensitive information and report suspected unauthorized access or disclosure to an administrator.

# 6. Policy updates
This policy may be updated to reflect changes in the platform, business processes or applicable requirements. The effective version is the one displayed in Procurement Sys.

This default policy is an operational template and should be reviewed by management and legal advisers before production use.
TEXT,
            ],
            [
                'slug' => 'supplier-policy',
                'title' => 'Supplier Policy',
                'summary' => 'The operating standards for supplier records, documents, catalogues and collaboration.',
                'content' => <<<'TEXT'
# 1. Supplier information
Supplier records must be complete, current and supported by appropriate registration, contact, tax, banking and compliance information where required by the organization.

# 2. Products and prices
Suppliers may maintain approved product and price information only through the functions made available to them. Prices, availability, lead times and descriptions must be accurate and updated promptly when they change.

# 3. Documents
Supplier documents must be relevant to the business relationship, clearly named, legible and free from malicious content. The organization may reject, archive or remove documents that are inaccurate, duplicated, expired or unrelated to the relationship.

# 4. Purchase orders and fulfilment
Suppliers must review purchase orders through the platform, confirm accepted quantities and dates, and communicate exceptions promptly. A purchase order does not authorize a change to quantity, price or delivery terms unless the change is approved through the organization’s process.

# 5. Confidentiality and conduct
Supplier users must protect commercial and personal information, use only their own accounts and comply with applicable laws, safety standards and agreed service levels.

# 6. Review
The organization may suspend access or request updated information when records are incomplete, a supplier relationship ends, or a security or compliance concern arises.

This default policy is an operational template and should be reviewed by management and legal advisers before production use.
TEXT,
            ],
            [
                'slug' => 'procurement-ordering-policy',
                'title' => 'Procurement Ordering Policy',
                'summary' => 'The controls for requesting, approving, receiving and recording purchases.',
                'content' => <<<'TEXT'
# 1. Purchase requests
Purchase requests must describe the required goods or services, quantity, business purpose, required date, delivery location and allocation information. Users must check existing stock and approved supplier information before raising a request.

# 2. Approval and authority
Orders must follow the organization’s approval thresholds and role permissions. Users must not approve their own requests or split requests to avoid an approval limit.

# 3. Purchase orders
Only an approved purchase order or other authorized procurement record may commit the organization to a supplier. Changes to an order must be documented and approved by an authorized user.

# 4. Receiving and payment records
Received quantities and condition must be recorded promptly. Invoices and payments should be matched against the approved order and recorded receiving information before payment is authorized, subject to the organization’s controls.

# 5. Exceptions and emergencies
Urgent or exceptional purchases must include a reason and follow the organization’s emergency approval process. Any exception should be reviewed after the event and retained in the procurement record.

# 6. Audit and records
Requests, approvals, orders, receipts, adjustments, attachments and related comments form part of the procurement record and must not be deleted or altered outside authorized procedures.

This default policy is an operational template and should be reviewed by management and legal advisers before production use.
TEXT,
            ],
        ];
    }
}
