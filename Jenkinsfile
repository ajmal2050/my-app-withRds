pipeline {
    agent any

    environment {
        // AWS Credentials & Registry Configuration
        AWS_REGION           = credentials('aws-region-secret')
        ECR_REGISTRY         = credentials('aws-ecr-registry-url')
        ECR_REPO             = credentials('aws-ecr-repo-name')

        // AWS ECS Fargate Cluster & Service Configuration
        ECS_CLUSTER          = credentials('aws-ecs-cluster-name')
        ECS_SERVICE_BACKEND  = credentials('aws-ecs-service-backend')
        ECS_SERVICE_FRONTEND = credentials('aws-ecs-service-frontend')
        TASK_FAMILY_BACKEND  = 'backend-task-family'
        TASK_FAMILY_FRONTEND = 'frontend-task-family'

        // Dynamic Build Tag
        IMAGE_TAG            = "${env.BUILD_NUMBER}"
    }

    stages {
        stage('1. Checkout Code') {
            steps {
                echo 'Checking out source code from SCM...'
                checkout scm
            }
        }

        stage('2. Build Docker Images') {
            steps {
                echo 'Building Docker images using Docker Compose...'
                script {
                    sh '''
                        docker compose build
                    '''
                }
            }
        }

        stage('3. Push to AWS ECR') {
            steps {
                echo 'Authenticating with AWS ECR and pushing images...'
                withCredentials([[
                    $class: 'AmazonWebServicesCredentialsBinding',
                    credentialsId: 'aws-ecr-credentials',
                    accessKeyVariable: 'AWS_ACCESS_KEY_ID',
                    secretKeyVariable: 'AWS_SECRET_ACCESS_KEY'
                ]]) {
                    sh '''
                        echo "==> Logging into AWS ECR..."
                        aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_REGISTRY}

                        echo "==> Pushing backend image to ECR: ${ECR_REGISTRY}/${ECR_REPO}:backend-${IMAGE_TAG}"
                        docker push ${ECR_REGISTRY}/${ECR_REPO}:backend-${IMAGE_TAG}

                        echo "==> Pushing frontend image to ECR: ${ECR_REGISTRY}/${ECR_REPO}:frontend-${IMAGE_TAG}"
                        docker push ${ECR_REGISTRY}/${ECR_REPO}:frontend-${IMAGE_TAG}
                    '''
                }
            }
        }

        stage('4. Deploy to AWS ECS Fargate') {
            steps {
                echo 'Starting deployment to AWS ECS Fargate...'
                withCredentials([[
                    $class: 'AmazonWebServicesCredentialsBinding',
                    credentialsId: 'aws-ecr-credentials',
                    accessKeyVariable: 'AWS_ACCESS_KEY_ID',
                    secretKeyVariable: 'AWS_SECRET_ACCESS_KEY'
                ]]) {
                    sh '''
                        # -----------------------------------------------------------------
                        # 1. Update Backend Task Definition & Service
                        # -----------------------------------------------------------------
                        echo "==> Fetching current Backend task definition..."
                        TASK_DEF_BACKEND=$(aws ecs describe-task-definition \
                            --task-definition ${TASK_FAMILY_BACKEND} \
                            --region ${AWS_REGION})

                        echo "==> Updating container image tag for Backend..."
                        NEW_TASK_DEF_BACKEND=$(echo $TASK_DEF_BACKEND | jq --arg IMAGE "${ECR_REGISTRY}/${ECR_REPO}:backend-${IMAGE_TAG}" \
                            '.taskDefinition | .containerDefinitions[0].image = $IMAGE | del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .registeredAt, .registeredBy)')

                        echo "$NEW_TASK_DEF_BACKEND" > backend-task-def.json

                        echo "==> Registering new Backend task definition revision..."
                        NEW_REV_BACKEND=$(aws ecs register-task-definition \
                            --region ${AWS_REGION} \
                            --cli-input-json file://backend-task-def.json \
                            | jq -r '.taskDefinition.taskDefinitionArn')

                        echo "==> Triggering forced deployment for Backend service..."
                        aws ecs update-service \
                            --cluster ${ECS_CLUSTER} \
                            --service ${ECS_SERVICE_BACKEND} \
                            --task-definition ${NEW_REV_BACKEND} \
                            --force-new-deployment \
                            --region ${AWS_REGION}

                        # -----------------------------------------------------------------
                        # 2. Update Frontend Task Definition & Service
                        # -----------------------------------------------------------------
                        echo "==> Fetching current Frontend task definition..."
                        TASK_DEF_FRONTEND=$(aws ecs describe-task-definition \
                            --task-definition ${TASK_FAMILY_FRONTEND} \
                            --region ${AWS_REGION})

                        echo "==> Updating container image tag for Frontend..."
                        NEW_TASK_DEF_FRONTEND=$(echo $TASK_DEF_FRONTEND | jq --arg IMAGE "${ECR_REGISTRY}/${ECR_REPO}:frontend-${IMAGE_TAG}" \
                            '.taskDefinition | .containerDefinitions[0].image = $IMAGE | del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .registeredAt, .registeredBy)')

                        echo "$NEW_TASK_DEF_FRONTEND" > frontend-task-def.json

                        echo "==> Registering new Frontend task definition revision..."
                        NEW_REV_FRONTEND=$(aws ecs register-task-definition \
                            --region ${AWS_REGION} \
                            --cli-input-json file://frontend-task-def.json \
                            | jq -r '.taskDefinition.taskDefinitionArn')

                        echo "==> Triggering forced deployment for Frontend service..."
                        aws ecs update-service \
                            --cluster ${ECS_CLUSTER} \
                            --service ${ECS_SERVICE_FRONTEND} \
                            --task-definition ${NEW_REV_FRONTEND} \
                            --force-new-deployment \
                            --region ${AWS_REGION}

                        # -----------------------------------------------------------------
                        # 3. Wait for ECS Services to stabilize
                        # -----------------------------------------------------------------
                        echo "==> Waiting for ECS Fargate services to stabilize..."
                        aws ecs wait services-stable \
                            --cluster ${ECS_CLUSTER} \
                            --services ${ECS_SERVICE_BACKEND} ${ECS_SERVICE_FRONTEND} \
                            --region ${AWS_REGION}

                        echo "==> ECS Fargate deployment complete!"
                    '''
                }
            }
        }
    }

    post {
        success {
            echo '✅ Pipeline executed successfully! Deployment to AWS ECS Fargate complete.'
        }
        failure {
            echo '❌ Pipeline failed. Please check build logs.'
        }
    }
}
