pipeline {
    agent any

    environment {
        // AWS & ECR Variables
        AWS_REGION         = credentials('aws-region-secret')
        ECR_REGISTRY       = credentials('aws-ecr-registry-url')
        
        // Repositories
        ECR_REPO           = credentials('aws-ecr-repo-name')
        ECR_REPO_BACKEND   = credentials('aws-ecr-repo-name-backend')
        
        // ECS Fargate Variables
        ECS_CLUSTER          = 'frontend-cluster'
        ECS_SERVICE_BACKEND  = 'staff-app-backend-service-0edv7m6t'
        // IMPORTANT: Replace the "..." below with the full name from your AWS console
        ECS_SERVICE_FRONTEND = 'staff-app-task-defnition-service-b83mlksv' 
        
        // Dynamic build tag
        IMAGE_TAG          = "${env.BUILD_NUMBER}"
    }

    stages {
        stage('1. Checkout Code') {
            steps {
                echo 'Checking out source code from GitHub...'
                checkout scm
            }
        }

        stage('2. Build & Push to ECR') {
            steps {
                echo 'Building and pushing directly to AWS ECR...'
                withCredentials([[
                    $class: 'AmazonWebServicesCredentialsBinding',
                    credentialsId: 'aws-ecr-credentials',
                    accessKeyVariable: 'AWS_ACCESS_KEY_ID',
                    secretKeyVariable: 'AWS_SECRET_ACCESS_KEY'
                ]]) {
                    sh '''
                        # 1. Login to AWS ECR
                        aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REGISTRY
                        
                        # 2. Build and Tag Frontend (using ECR_REPO), then Push
                        docker build -t $ECR_REGISTRY/${ECR_REPO}:frontend-${IMAGE_TAG} ./frontend
                        docker push $ECR_REGISTRY/${ECR_REPO}:frontend-${IMAGE_TAG}
                        
                        # 3. Build and Tag Backend, then Push
                        docker build -t $ECR_REGISTRY/${ECR_REPO_BACKEND}:backend-${IMAGE_TAG} ./backend
                        docker push $ECR_REGISTRY/${ECR_REPO_BACKEND}:backend-${IMAGE_TAG}
                    '''
                }
            }
        }

        stage('3. Deploy to ECS Fargate') {
            steps {
                echo 'Deploying new containers to AWS ECS Fargate...'
                withCredentials([[
                    $class: 'AmazonWebServicesCredentialsBinding',
                    credentialsId: 'aws-ecr-credentials',
                    accessKeyVariable: 'AWS_ACCESS_KEY_ID',
                    secretKeyVariable: 'AWS_SECRET_ACCESS_KEY'
                ]]) {
                    sh '''
                        # 1. Inject the new Image URLs into BOTH Task Definition Templates
                        # Make sure these filenames match the ones in your GitHub repo!
                        
                        sed -e "s|<FRONTEND_IMAGE>|$ECR_REGISTRY/${ECR_REPO}:frontend-${IMAGE_TAG}|g" \
                            frontend-task-def-template.json > frontend-task-def.json
                            
                        sed -e "s|<BACKEND_IMAGE>|$ECR_REGISTRY/${ECR_REPO_BACKEND}:backend-${IMAGE_TAG}|g" \
                            backend-task-def-template.json > backend-task-def.json
                            
                        # 2. Register BOTH Task Definitions in AWS
                        FRONTEND_REVISION=$(aws ecs register-task-definition --region $AWS_REGION --cli-input-json file://frontend-task-def.json --query 'taskDefinition.taskDefinitionArn' --output text)
                        BACKEND_REVISION=$(aws ecs register-task-definition --region $AWS_REGION --cli-input-json file://backend-task-def.json --query 'taskDefinition.taskDefinitionArn' --output text)
                        
                        echo "Registered Frontend Task Definition: $FRONTEND_REVISION"
                        echo "Registered Backend Task Definition: $BACKEND_REVISION"
                        
                        # 3. Update BOTH ECS Services with their specific revisions
                        echo "Updating Frontend Service..."
                        aws ecs update-service --region $AWS_REGION --cluster $ECS_CLUSTER --service $ECS_SERVICE_FRONTEND --task-definition $FRONTEND_REVISION --force-new-deployment
                        
                        echo "Updating Backend Service..."
                        aws ecs update-service --region $AWS_REGION --cluster $ECS_CLUSTER --service $ECS_SERVICE_BACKEND --task-definition $BACKEND_REVISION --force-new-deployment
                    '''
                }
            }
        }
    }

    post {
        success {
            echo '✅ Pipeline succeeded! Fargate containers are spinning up and attaching to the ALB.'
        }
        failure {
            echo '❌ Pipeline failed. Please check the build logs above.'
        }
    }
}
