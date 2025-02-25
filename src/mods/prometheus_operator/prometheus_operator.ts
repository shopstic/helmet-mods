import type { K8sResource } from "$deps/helmet.ts";

// These are generated from prometheus-operator CRDs

/**
 * ServiceMonitor defines monitoring for a set of services.
 */
export interface ServiceMonitorV1 {
  /**
   * APIVersion defines the versioned schema of this representation of an object. Servers should convert recognized schemas to the latest internal value, and may reject unrecognized values. More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#resources
   */
  apiVersion?: string;
  /**
   * Kind is a string value representing the REST resource this object represents. Servers may infer this from the endpoint the client submits requests to. Cannot be updated. In CamelCase. More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds
   */
  kind?: string;
  metadata?: {
    [k: string]: unknown;
  };
  /**
   * Specification of desired Service selection for target discovery by Prometheus.
   */
  spec: {
    /**
     * A list of endpoints allowed as part of this ServiceMonitor.
     */
    endpoints: {
      /**
       * BasicAuth allow an endpoint to authenticate over basic authentication More info: https://prometheus.io/docs/operating/configuration/#endpoints
       */
      basicAuth?: {
        /**
         * The secret in the service monitor namespace that contains the password for authentication.
         */
        password?: {
          /**
           * The key of the secret to select from.  Must be a valid secret key.
           */
          key: string;
          /**
           * Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names TODO: Add other useful fields. apiVersion, kind, uid?
           */
          name?: string;
          /**
           * Specify whether the Secret or its key must be defined
           */
          optional?: boolean;
        };
        /**
         * The secret in the service monitor namespace that contains the username for authentication.
         */
        username?: {
          /**
           * The key of the secret to select from.  Must be a valid secret key.
           */
          key: string;
          /**
           * Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names TODO: Add other useful fields. apiVersion, kind, uid?
           */
          name?: string;
          /**
           * Specify whether the Secret or its key must be defined
           */
          optional?: boolean;
        };
      };
      /**
       * File to read bearer token for scraping targets.
       */
      bearerTokenFile?: string;
      /**
       * Secret to mount to read bearer token for scraping targets. The secret needs to be in the same namespace as the service monitor and accessible by the Prometheus Operator.
       */
      bearerTokenSecret?: {
        /**
         * The key of the secret to select from.  Must be a valid secret key.
         */
        key: string;
        /**
         * Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names TODO: Add other useful fields. apiVersion, kind, uid?
         */
        name?: string;
        /**
         * Specify whether the Secret or its key must be defined
         */
        optional?: boolean;
      };
      /**
       * HonorLabels chooses the metric's labels on collisions with target labels.
       */
      honorLabels?: boolean;
      /**
       * HonorTimestamps controls whether Prometheus respects the timestamps present in scraped data.
       */
      honorTimestamps?: boolean;
      /**
       * Interval at which metrics should be scraped
       */
      interval?: string;
      /**
       * MetricRelabelConfigs to apply to samples before ingestion.
       */
      metricRelabelings?: {
        /**
         * Action to perform based on regex matching. Default is 'replace'
         */
        action?: string;
        /**
         * Modulus to take of the hash of the source label values.
         */
        modulus?: number;
        /**
         * Regular expression against which the extracted value is matched. Default is '(.*)'
         */
        regex?: string;
        /**
         * Replacement value against which a regex replace is performed if the regular expression matches. Regex capture groups are available. Default is '$1'
         */
        replacement?: string;
        /**
         * Separator placed between concatenated source label values. default is ';'.
         */
        separator?: string;
        /**
         * The source labels select values from existing labels. Their content is concatenated using the configured separator and matched against the configured regular expression for the replace, keep, and drop actions.
         */
        sourceLabels?: string[];
        /**
         * Label to which the resulting value is written in a replace action. It is mandatory for replace actions. Regex capture groups are available.
         */
        targetLabel?: string;
      }[];
      /**
       * Optional HTTP URL parameters
       */
      params?: {
        [k: string]: string[];
      };
      /**
       * HTTP path to scrape for metrics.
       */
      path?: string;
      /**
       * Name of the service port this endpoint refers to. Mutually exclusive with targetPort.
       */
      port?: string;
      /**
       * ProxyURL eg http://proxyserver:2195 Directs scrapes to proxy through this endpoint.
       */
      proxyUrl?: string;
      /**
       * RelabelConfigs to apply to samples before scraping. Prometheus Operator automatically adds relabelings for a few standard Kubernetes fields and replaces original scrape job name with __tmp_prometheus_job_name. More info: https://prometheus.io/docs/prometheus/latest/configuration/configuration/#relabel_config
       */
      relabelings?: {
        /**
         * Action to perform based on regex matching. Default is 'replace'
         */
        action?: string;
        /**
         * Modulus to take of the hash of the source label values.
         */
        modulus?: number;
        /**
         * Regular expression against which the extracted value is matched. Default is '(.*)'
         */
        regex?: string;
        /**
         * Replacement value against which a regex replace is performed if the regular expression matches. Regex capture groups are available. Default is '$1'
         */
        replacement?: string;
        /**
         * Separator placed between concatenated source label values. default is ';'.
         */
        separator?: string;
        /**
         * The source labels select values from existing labels. Their content is concatenated using the configured separator and matched against the configured regular expression for the replace, keep, and drop actions.
         */
        sourceLabels?: string[];
        /**
         * Label to which the resulting value is written in a replace action. It is mandatory for replace actions. Regex capture groups are available.
         */
        targetLabel?: string;
      }[];
      /**
       * HTTP scheme to use for scraping.
       */
      scheme?: string;
      /**
       * Timeout after which the scrape is ended
       */
      scrapeTimeout?: string;
      /**
       * Name or number of the target port of the Pod behind the Service, the port must be specified with container port property. Mutually exclusive with port.
       */
      targetPort?: number | string;
      /**
       * TLS configuration to use when scraping the endpoint
       */
      tlsConfig?: {
        /**
         * Struct containing the CA cert to use for the targets.
         */
        ca?: {
          /**
           * ConfigMap containing data to use for the targets.
           */
          configMap?: {
            /**
             * The key to select.
             */
            key: string;
            /**
             * Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names TODO: Add other useful fields. apiVersion, kind, uid?
             */
            name?: string;
            /**
             * Specify whether the ConfigMap or its key must be defined
             */
            optional?: boolean;
          };
          /**
           * Secret containing data to use for the targets.
           */
          secret?: {
            /**
             * The key of the secret to select from.  Must be a valid secret key.
             */
            key: string;
            /**
             * Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names TODO: Add other useful fields. apiVersion, kind, uid?
             */
            name?: string;
            /**
             * Specify whether the Secret or its key must be defined
             */
            optional?: boolean;
          };
        };
        /**
         * Path to the CA cert in the Prometheus container to use for the targets.
         */
        caFile?: string;
        /**
         * Struct containing the client cert file for the targets.
         */
        cert?: {
          /**
           * ConfigMap containing data to use for the targets.
           */
          configMap?: {
            /**
             * The key to select.
             */
            key: string;
            /**
             * Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names TODO: Add other useful fields. apiVersion, kind, uid?
             */
            name?: string;
            /**
             * Specify whether the ConfigMap or its key must be defined
             */
            optional?: boolean;
          };
          /**
           * Secret containing data to use for the targets.
           */
          secret?: {
            /**
             * The key of the secret to select from.  Must be a valid secret key.
             */
            key: string;
            /**
             * Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names TODO: Add other useful fields. apiVersion, kind, uid?
             */
            name?: string;
            /**
             * Specify whether the Secret or its key must be defined
             */
            optional?: boolean;
          };
        };
        /**
         * Path to the client cert file in the Prometheus container for the targets.
         */
        certFile?: string;
        /**
         * Disable target certificate validation.
         */
        insecureSkipVerify?: boolean;
        /**
         * Path to the client key file in the Prometheus container for the targets.
         */
        keyFile?: string;
        /**
         * Secret containing the client key file for the targets.
         */
        keySecret?: {
          /**
           * The key of the secret to select from.  Must be a valid secret key.
           */
          key: string;
          /**
           * Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names TODO: Add other useful fields. apiVersion, kind, uid?
           */
          name?: string;
          /**
           * Specify whether the Secret or its key must be defined
           */
          optional?: boolean;
        };
        /**
         * Used to verify the hostname for the targets.
         */
        serverName?: string;
      };
    }[];
    /**
     * The label to use to retrieve the job name from.
     */
    jobLabel?: string;
    /**
     * Selector to select which namespaces the Endpoints objects are discovered from.
     */
    namespaceSelector?: {
      /**
       * Boolean describing whether all namespaces are selected in contrast to a list restricting them.
       */
      any?: boolean;
      /**
       * List of namespace names.
       */
      matchNames?: string[];
    };
    /**
     * PodTargetLabels transfers labels on the Kubernetes Pod onto the target.
     */
    podTargetLabels?: string[];
    /**
     * SampleLimit defines per-scrape limit on number of scraped samples that will be accepted.
     */
    sampleLimit?: number;
    /**
     * Selector to select Endpoints objects.
     */
    selector: {
      /**
       * matchExpressions is a list of label selector requirements. The requirements are ANDed.
       */
      matchExpressions?: {
        /**
         * key is the label key that the selector applies to.
         */
        key: string;
        /**
         * operator represents a key's relationship to a set of values. Valid operators are In, NotIn, Exists and DoesNotExist.
         */
        operator: string;
        /**
         * values is an array of string values. If the operator is In or NotIn, the values array must be non-empty. If the operator is Exists or DoesNotExist, the values array must be empty. This array is replaced during a strategic merge patch.
         */
        values?: string[];
      }[];
      /**
       * matchLabels is a map of {key,value} pairs. A single {key,value} in the matchLabels map is equivalent to an element of matchExpressions, whose key field is "key", the operator is "In", and the values array contains only "value". The requirements are ANDed.
       */
      matchLabels?: {
        [k: string]: string;
      };
    };
    /**
     * TargetLabels transfers labels on the Kubernetes Service onto the target.
     */
    targetLabels?: string[];
    /**
     * TargetLimit defines a limit on the number of scraped targets that will be accepted.
     */
    targetLimit?: number;
  };
}

export function createServiceMonitorV1(
  obj: ServiceMonitorV1 & Pick<K8sResource, "metadata">,
): ServiceMonitorV1 & K8sResource {
  return {
    // @ts-ignore generated
    apiVersion: "monitoring.coreos.com/v1",
    // @ts-ignore generated
    kind: "ServiceMonitor",
    ...obj,
  };
}

/**
 * PodMonitor defines monitoring for a set of pods.
 */
export interface PodMonitorV1 {
  /**
   * APIVersion defines the versioned schema of this representation of an object. Servers should convert recognized schemas to the latest internal value, and may reject unrecognized values. More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#resources
   */
  apiVersion?: string;
  /**
   * Kind is a string value representing the REST resource this object represents. Servers may infer this from the endpoint the client submits requests to. Cannot be updated. In CamelCase. More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds
   */
  kind?: string;
  metadata?: {
    [k: string]: unknown;
  };
  /**
   * Specification of desired Pod selection for target discovery by Prometheus.
   */
  spec: {
    /**
     * The label to use to retrieve the job name from.
     */
    jobLabel?: string;
    /**
     * Selector to select which namespaces the Endpoints objects are discovered from.
     */
    namespaceSelector?: {
      /**
       * Boolean describing whether all namespaces are selected in contrast to a list restricting them.
       */
      any?: boolean;
      /**
       * List of namespace names.
       */
      matchNames?: string[];
    };
    /**
     * A list of endpoints allowed as part of this PodMonitor.
     */
    podMetricsEndpoints: {
      /**
       * BasicAuth allow an endpoint to authenticate over basic authentication. More info: https://prometheus.io/docs/operating/configuration/#endpoint
       */
      basicAuth?: {
        /**
         * The secret in the service monitor namespace that contains the password for authentication.
         */
        password?: {
          /**
           * The key of the secret to select from.  Must be a valid secret key.
           */
          key: string;
          /**
           * Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names TODO: Add other useful fields. apiVersion, kind, uid?
           */
          name?: string;
          /**
           * Specify whether the Secret or its key must be defined
           */
          optional?: boolean;
        };
        /**
         * The secret in the service monitor namespace that contains the username for authentication.
         */
        username?: {
          /**
           * The key of the secret to select from.  Must be a valid secret key.
           */
          key: string;
          /**
           * Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names TODO: Add other useful fields. apiVersion, kind, uid?
           */
          name?: string;
          /**
           * Specify whether the Secret or its key must be defined
           */
          optional?: boolean;
        };
      };
      /**
       * Secret to mount to read bearer token for scraping targets. The secret needs to be in the same namespace as the pod monitor and accessible by the Prometheus Operator.
       */
      bearerTokenSecret?: {
        /**
         * The key of the secret to select from.  Must be a valid secret key.
         */
        key: string;
        /**
         * Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names TODO: Add other useful fields. apiVersion, kind, uid?
         */
        name?: string;
        /**
         * Specify whether the Secret or its key must be defined
         */
        optional?: boolean;
      };
      /**
       * HonorLabels chooses the metric's labels on collisions with target labels.
       */
      honorLabels?: boolean;
      /**
       * HonorTimestamps controls whether Prometheus respects the timestamps present in scraped data.
       */
      honorTimestamps?: boolean;
      /**
       * Interval at which metrics should be scraped
       */
      interval?: string;
      /**
       * MetricRelabelConfigs to apply to samples before ingestion.
       */
      metricRelabelings?: {
        /**
         * Action to perform based on regex matching. Default is 'replace'
         */
        action?: string;
        /**
         * Modulus to take of the hash of the source label values.
         */
        modulus?: number;
        /**
         * Regular expression against which the extracted value is matched. Default is '(.*)'
         */
        regex?: string;
        /**
         * Replacement value against which a regex replace is performed if the regular expression matches. Regex capture groups are available. Default is '$1'
         */
        replacement?: string;
        /**
         * Separator placed between concatenated source label values. default is ';'.
         */
        separator?: string;
        /**
         * The source labels select values from existing labels. Their content is concatenated using the configured separator and matched against the configured regular expression for the replace, keep, and drop actions.
         */
        sourceLabels?: string[];
        /**
         * Label to which the resulting value is written in a replace action. It is mandatory for replace actions. Regex capture groups are available.
         */
        targetLabel?: string;
      }[];
      /**
       * Optional HTTP URL parameters
       */
      params?: {
        [k: string]: string[];
      };
      /**
       * HTTP path to scrape for metrics.
       */
      path?: string;
      /**
       * Name of the pod port this endpoint refers to. Mutually exclusive with targetPort.
       */
      port?: string;
      /**
       * ProxyURL eg http://proxyserver:2195 Directs scrapes to proxy through this endpoint.
       */
      proxyUrl?: string;
      /**
       * RelabelConfigs to apply to samples before scraping. Prometheus Operator automatically adds relabelings for a few standard Kubernetes fields and replaces original scrape job name with __tmp_prometheus_job_name. More info: https://prometheus.io/docs/prometheus/latest/configuration/configuration/#relabel_config
       */
      relabelings?: {
        /**
         * Action to perform based on regex matching. Default is 'replace'
         */
        action?: string;
        /**
         * Modulus to take of the hash of the source label values.
         */
        modulus?: number;
        /**
         * Regular expression against which the extracted value is matched. Default is '(.*)'
         */
        regex?: string;
        /**
         * Replacement value against which a regex replace is performed if the regular expression matches. Regex capture groups are available. Default is '$1'
         */
        replacement?: string;
        /**
         * Separator placed between concatenated source label values. default is ';'.
         */
        separator?: string;
        /**
         * The source labels select values from existing labels. Their content is concatenated using the configured separator and matched against the configured regular expression for the replace, keep, and drop actions.
         */
        sourceLabels?: string[];
        /**
         * Label to which the resulting value is written in a replace action. It is mandatory for replace actions. Regex capture groups are available.
         */
        targetLabel?: string;
      }[];
      /**
       * HTTP scheme to use for scraping.
       */
      scheme?: string;
      /**
       * Timeout after which the scrape is ended
       */
      scrapeTimeout?: string;
      /**
       * Deprecated: Use 'port' instead.
       */
      targetPort?: number | string;
      /**
       * TLS configuration to use when scraping the endpoint.
       */
      tlsConfig?: {
        /**
         * Struct containing the CA cert to use for the targets.
         */
        ca?: {
          /**
           * ConfigMap containing data to use for the targets.
           */
          configMap?: {
            /**
             * The key to select.
             */
            key: string;
            /**
             * Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names TODO: Add other useful fields. apiVersion, kind, uid?
             */
            name?: string;
            /**
             * Specify whether the ConfigMap or its key must be defined
             */
            optional?: boolean;
          };
          /**
           * Secret containing data to use for the targets.
           */
          secret?: {
            /**
             * The key of the secret to select from.  Must be a valid secret key.
             */
            key: string;
            /**
             * Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names TODO: Add other useful fields. apiVersion, kind, uid?
             */
            name?: string;
            /**
             * Specify whether the Secret or its key must be defined
             */
            optional?: boolean;
          };
        };
        /**
         * Struct containing the client cert file for the targets.
         */
        cert?: {
          /**
           * ConfigMap containing data to use for the targets.
           */
          configMap?: {
            /**
             * The key to select.
             */
            key: string;
            /**
             * Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names TODO: Add other useful fields. apiVersion, kind, uid?
             */
            name?: string;
            /**
             * Specify whether the ConfigMap or its key must be defined
             */
            optional?: boolean;
          };
          /**
           * Secret containing data to use for the targets.
           */
          secret?: {
            /**
             * The key of the secret to select from.  Must be a valid secret key.
             */
            key: string;
            /**
             * Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names TODO: Add other useful fields. apiVersion, kind, uid?
             */
            name?: string;
            /**
             * Specify whether the Secret or its key must be defined
             */
            optional?: boolean;
          };
        };
        /**
         * Disable target certificate validation.
         */
        insecureSkipVerify?: boolean;
        /**
         * Secret containing the client key file for the targets.
         */
        keySecret?: {
          /**
           * The key of the secret to select from.  Must be a valid secret key.
           */
          key: string;
          /**
           * Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names TODO: Add other useful fields. apiVersion, kind, uid?
           */
          name?: string;
          /**
           * Specify whether the Secret or its key must be defined
           */
          optional?: boolean;
        };
        /**
         * Used to verify the hostname for the targets.
         */
        serverName?: string;
      };
    }[];
    /**
     * PodTargetLabels transfers labels on the Kubernetes Pod onto the target.
     */
    podTargetLabels?: string[];
    /**
     * SampleLimit defines per-scrape limit on number of scraped samples that will be accepted.
     */
    sampleLimit?: number;
    /**
     * Selector to select Pod objects.
     */
    selector: {
      /**
       * matchExpressions is a list of label selector requirements. The requirements are ANDed.
       */
      matchExpressions?: {
        /**
         * key is the label key that the selector applies to.
         */
        key: string;
        /**
         * operator represents a key's relationship to a set of values. Valid operators are In, NotIn, Exists and DoesNotExist.
         */
        operator: string;
        /**
         * values is an array of string values. If the operator is In or NotIn, the values array must be non-empty. If the operator is Exists or DoesNotExist, the values array must be empty. This array is replaced during a strategic merge patch.
         */
        values?: string[];
      }[];
      /**
       * matchLabels is a map of {key,value} pairs. A single {key,value} in the matchLabels map is equivalent to an element of matchExpressions, whose key field is "key", the operator is "In", and the values array contains only "value". The requirements are ANDed.
       */
      matchLabels?: {
        [k: string]: string;
      };
    };
    /**
     * TargetLimit defines a limit on the number of scraped targets that will be accepted.
     */
    targetLimit?: number;
  };
}

export function createPodMonitorV1(
  obj: PodMonitorV1 & Pick<K8sResource, "metadata">,
): PodMonitorV1 & K8sResource {
  return {
    // @ts-ignore generated
    apiVersion: "monitoring.coreos.com/v1",
    // @ts-ignore generated
    kind: "PodMonitor",
    ...obj,
  };
}
